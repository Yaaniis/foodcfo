import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getRestaurantThresholds } from '../lib/restaurantThresholds';
import { monthRangeInTimezone } from '../lib/timezone';
import { computeMenuItemMargin } from './menuItem.controller';
import { potentialSavingToReachGreen } from '../lib/margin';
import { buildMonthlyReportEmail, type MonthlyReportData } from '../lib/monthlyReport';
import { sendEmail, EmailError } from '../lib/email';

// Rassemble les mêmes données que le tableau de bord (Phase 2) et les
// statistiques de gaspillage (Phase 5), plus les achats fournisseurs du
// mois — c'est littéralement le même calcul que ces deux endpoints,
// reformaté en rapport de synthèse plutôt qu'en JSON pour écran.
//
// `referenceDate` détermine quel mois est rapporté : le mois qui le
// contient, dans le fuseau horaire du restaurant (pas celui du
// serveur). Le déclenchement manuel ("aperçu"/"envoyer maintenant")
// utilise le mois en cours par défaut (utile en cours de mois). Le job
// planifié (voir lib/monthlyReportScheduler.ts), lui, passe une date
// dans le mois précédent pour recevoir un vrai récapitulatif du mois
// qui vient de se terminer, pas un rapport vide du mois qui commence.
export async function gatherMonthlyReportData(
  restaurantId: string,
  referenceDate: Date = new Date(),
): Promise<MonthlyReportData> {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { name: true, timezone: true },
  });
  const { monthStart, monthEnd, monthLabel } = monthRangeInTimezone(referenceDate, restaurant.timezone);

  const [menuItems, thresholds, wasteAggregate, invoiceAggregate] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId, isActive: true },
      include: { recipe: { include: { ingredients: { include: { product: true } } } } },
    }),
    getRestaurantThresholds(restaurantId),
    prisma.wasteEntry.aggregate({
      where: { restaurantId, declaredAt: { gte: monthStart, lt: monthEnd } },
      _sum: { estimatedValue: true },
    }),
    prisma.invoice.aggregate({
      where: { restaurantId, status: 'VALIDATED', invoiceDate: { gte: monthStart, lt: monthEnd } },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  const withMargin = menuItems.map((item) => ({
    sellingPriceTTC: item.sellingPriceTTC,
    margin: computeMenuItemMargin(item, thresholds),
  }));
  const withMarginOnly = withMargin.filter(
    (i): i is typeof i & { margin: NonNullable<(typeof i)['margin']> } => i.margin !== null,
  );

  const greenCount = withMarginOnly.filter((i) => i.margin.status === 'GREEN').length;
  const orangeCount = withMarginOnly.filter((i) => i.margin.status === 'ORANGE').length;
  const redCount = withMarginOnly.filter((i) => i.margin.status === 'RED').length;
  const averageMarginRatio =
    withMarginOnly.length > 0
      ? withMarginOnly.reduce((sum, i) => sum + i.margin.marginRatio, 0) / withMarginOnly.length
      : null;
  const potentialSavings = withMarginOnly
    .filter((i) => i.margin.status !== 'GREEN')
    .reduce(
      (sum, i) => sum + potentialSavingToReachGreen(Number(i.sellingPriceTTC), i.margin.costHT, thresholds),
      0,
    );

  return {
    restaurantName: restaurant.name,
    month: monthLabel,
    averageMarginRatio,
    greenCount,
    orangeCount,
    redCount,
    potentialSavings,
    wasteTotal: Number(wasteAggregate._sum.estimatedValue ?? 0),
    invoiceCount: invoiceAggregate._count,
    invoiceTotal: Number(invoiceAggregate._sum.totalAmount ?? 0),
  };
}

export async function getMonthlyReportPreview(req: Request, res: Response) {
  const data = await gatherMonthlyReportData(req.user!.restaurantId);
  const email = buildMonthlyReportEmail(data);
  res.json({ data, email });
}

export interface SendMonthlyReportResult {
  data: MonthlyReportData;
  email: ReturnType<typeof buildMonthlyReportEmail>;
  sentTo: number;
  failedCount: number;
  firstFailureMessage: string | null;
}

// Cœur partagé entre le déclenchement manuel (HTTP, ci-dessous) et le
// job planifié (voir lib/monthlyReportScheduler.ts) — même logique
// d'envoi dans les deux cas, à tous les Gérants actifs du restaurant.
export async function sendMonthlyReportForRestaurant(
  restaurantId: string,
  referenceDate?: Date,
): Promise<SendMonthlyReportResult> {
  const data = await gatherMonthlyReportData(restaurantId, referenceDate);
  const email = buildMonthlyReportEmail(data);

  const gerants = await prisma.user.findMany({
    where: { restaurantId, role: 'GERANT', isActive: true },
    select: { email: true },
  });

  const failures: string[] = [];
  for (const gerant of gerants) {
    try {
      await sendEmail(gerant.email, email.subject, email.text);
    } catch (err) {
      const message = err instanceof EmailError ? err.message : "Échec inattendu de l'envoi.";
      logger.warn({ err, restaurantId, to: gerant.email }, 'Envoi du rapport mensuel échoué');
      failures.push(message);
    }
  }

  return {
    data,
    email,
    sentTo: gerants.length - failures.length,
    failedCount: failures.length,
    firstFailureMessage: failures[0] ?? null,
  };
}

// Envoi manuel ("maintenant") déclenché depuis l'écran gérant.
export async function sendMonthlyReport(req: Request, res: Response) {
  const gerantCount = await prisma.user.count({
    where: { restaurantId: req.user!.restaurantId, role: 'GERANT', isActive: true },
  });
  if (gerantCount === 0) {
    return res.status(400).json({ error: 'NO_RECIPIENT', message: 'Aucun compte Gérant actif à qui envoyer le rapport.' });
  }

  const result = await sendMonthlyReportForRestaurant(req.user!.restaurantId);

  if (result.sentTo === 0) {
    return res
      .status(502)
      .json({ error: 'EMAIL_SEND_FAILED', message: result.firstFailureMessage, data: result.data, email: result.email });
  }

  res.json({ sentTo: result.sentTo, failedCount: result.failedCount, data: result.data, email: result.email });
}
