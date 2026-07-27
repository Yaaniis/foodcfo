import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { potentialSavingToReachGreen } from '../lib/margin';
import { getRestaurantThresholds } from '../lib/restaurantThresholds';
import { monthRangeInTimezone } from '../lib/timezone';
import { computeMenuItemMargin } from './menuItem.controller';

export interface DashboardKpis {
  totalActiveMenuItems: number;
  missingRecipeCount: number;
  greenCount: number;
  orangeCount: number;
  redCount: number;
  averageMarginRatio: number | null;
  potentialSavings: number;
  wasteThisMonth: number;
}

// Vue agrégée "Santé des marges" pour UN restaurant — extrait de
// l'ancien getDashboard pour être réutilisable tel quel par la vue
// consolidée multi-restaurants (Phase 6+, un appel par restaurant lié
// au compte). Ne renvoie que les plats actifs (un plat retiré de la
// carte ne doit pas polluer les KPIs) et uniquement ceux dont la fiche
// technique est renseignée — un plat sans fiche technique n'a pas de
// marge calculable, il est compté à part pour inciter à compléter la
// fiche plutôt que d'être ignoré silencieusement.
export async function gatherDashboardData(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { timezone: true },
  });
  const { monthStart, monthEnd } = monthRangeInTimezone(new Date(), restaurant.timezone);

  const [menuItems, thresholds, wasteAggregate] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId, isActive: true },
      include: { recipe: { include: { ingredients: { include: { product: true } } } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    getRestaurantThresholds(restaurantId),
    prisma.wasteEntry.aggregate({
      where: { restaurantId, declaredAt: { gte: monthStart, lt: monthEnd } },
      _sum: { estimatedValue: true },
    }),
  ]);

  const withMargin = menuItems.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    sellingPriceTTC: item.sellingPriceTTC,
    margin: computeMenuItemMargin(item, thresholds),
  }));

  const missingRecipeCount = withMargin.filter((i) => i.margin === null).length;
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

  // "Économies potentielles" : somme, pour les plats orange et rouge,
  // du coût matière qu'il faudrait économiser (au prix de vente actuel)
  // pour ramener chaque plat au seuil vert.
  const potentialSavings = withMarginOnly
    .filter((i) => i.margin.status !== 'GREEN')
    .reduce(
      (sum, i) => sum + potentialSavingToReachGreen(Number(i.sellingPriceTTC), i.margin.costHT, thresholds),
      0,
    );

  const kpis: DashboardKpis = {
    totalActiveMenuItems: menuItems.length,
    missingRecipeCount,
    greenCount,
    orangeCount,
    redCount,
    averageMarginRatio,
    potentialSavings,
    wasteThisMonth: Number(wasteAggregate._sum.estimatedValue ?? 0),
  };

  return { thresholds, kpis, menuItems: withMargin };
}

export async function getDashboard(req: Request, res: Response) {
  const data = await gatherDashboardData(req.user!.restaurantId);
  // Service consulte la carte en lecture seule (décision 0.5) : la
  // marge, ses agrégats (marge moyenne, économies potentielles,
  // compteurs vert/orange/rouge) et le gaspillage en euros sont des
  // données de pilotage financier interne, masquées ici comme sur
  // GET /menu-items — pas seulement dans l'UI.
  if (req.user!.role === 'SERVICE') {
    return res.json({ thresholds: data.thresholds, kpis: null, menuItems: [] });
  }
  res.json(data);
}
