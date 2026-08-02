import { z } from 'zod';

// Bornes optionnelles, par défaut le mois calendaire en cours — même
// convention que invoiceExportQuerySchema (export.schemas.ts). Pas
// besoin du fuseau horaire du restaurant ici (contrairement aux
// factures, horodatées) : ShiftAssignment.date est déjà un concept de
// jour calendaire pur, sans ambiguïté de fuseau.
export const hoursSummaryQuerySchema = z
  .object({
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
  })
  .refine((data) => !data.periodStart || !data.periodEnd || data.periodStart <= data.periodEnd, {
    message: 'La date de fin doit être après la date de début.',
    path: ['periodEnd'],
  });

export type HoursSummaryQuery = z.infer<typeof hoursSummaryQuerySchema>;
