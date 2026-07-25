import { z } from 'zod';

// Période par défaut : le mois calendaire en cours (cohérent avec les
// autres vues "du mois" de l'app — dashboard, statistiques de
// gaspillage). Les deux bornes sont optionnelles et indépendantes pour
// permettre un export sur une plage arbitraire (ex: un trimestre pour
// la déclaration de TVA) si besoin.
export const invoiceExportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type InvoiceExportQuery = z.infer<typeof invoiceExportQuerySchema>;
