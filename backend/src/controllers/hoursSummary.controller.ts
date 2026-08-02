import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { toCsv } from '../lib/csv';
import { hoursSummaryQuerySchema } from '../schemas/hoursSummary.schemas';
import { computeHoursSummary, type WorkedShiftInput, type EmployeeHoursSummary } from '../lib/hoursSummary';

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMinutes(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function minutesToDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

// Extrait pour être réutilisé par le dossier de contrôle URSSAF/
// Inspection du travail (controlDocument.controller.ts, Phase 7.4) —
// même donnée que le récapitulatif comptable, juste consommée en JSON
// plutôt qu'en CSV téléchargeable.
export async function fetchEmployeeHoursSummary(
  restaurantId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<EmployeeHoursSummary[]> {
  const shiftAssignments = await prisma.shiftAssignment.findMany({
    where: {
      schedule: { restaurantId, status: 'VALIDATED' },
      date: { gte: periodStart, lte: periodEnd },
    },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const shifts: WorkedShiftInput[] = shiftAssignments.map((s) => {
    const useActual = s.actualStartTime !== null && s.actualEndTime !== null;
    const startTime = useActual ? s.actualStartTime! : s.startTime;
    const endTime = useActual ? s.actualEndTime! : s.endTime;
    return {
      userId: s.userId,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      date: toDateOnlyString(s.date),
      minutesWorked: s.isAbsent ? 0 : toMinutes(endTime) - toMinutes(startTime),
    };
  });

  return computeHoursSummary(shifts);
}

// Récapitulatif d'heures exportable pour le comptable (Phase 7.2,
// dernier morceau du module Planning) — remplace volontairement la
// génération d'un bulletin de paye légal (décision 7.0). Seuls les
// plannings VALIDATED sont inclus : un brouillon peut encore être
// modifié, ses heures ne sont pas fiables pour la comptabilité — même
// principe que exportInvoicesCsv (export.controller.ts) qui n'inclut
// que les factures VALIDATED.
export async function exportHoursSummaryCsv(req: Request, res: Response) {
  const query = hoursSummaryQuerySchema.parse(req.query);

  let periodStart = query.periodStart;
  let periodEnd = query.periodEnd;
  if (!periodStart || !periodEnd) {
    const now = new Date();
    periodStart = periodStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodEnd = periodEnd ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  }

  const summaries = await fetchEmployeeHoursSummary(req.user!.restaurantId, periodStart, periodEnd);

  const rows: (string | number)[][] = summaries.map((s) => [
    s.lastName,
    s.firstName,
    minutesToDecimalHours(s.totalMinutes),
    minutesToDecimalHours(s.regularMinutes),
    minutesToDecimalHours(s.overtimeMinutes),
    minutesToDecimalHours(s.sundayMinutes),
    minutesToDecimalHours(s.publicHolidayMinutes),
  ]);

  const csv = toCsv(
    ['Nom', 'Prénom', 'Heures totales', 'Heures normales', 'Heures supplémentaires', 'Heures dimanche', 'Heures jours fériés'],
    rows,
  );

  const filename = `recapitulatif_heures_${toDateOnlyString(periodStart)}_${toDateOnlyString(periodEnd)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
