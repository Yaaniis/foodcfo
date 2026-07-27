import { z } from 'zod';
import { DECIMAL_10_2_MAX, DECIMAL_10_4_MAX } from './decimalLimits';

export const patchInvoiceSchema = z
  .object({
    supplierId: z.string().min(1).nullable().optional(),
    invoiceDate: z.coerce.date().optional(),
    totalAmount: z.coerce.number().nonnegative().max(DECIMAL_10_2_MAX, 'Montant trop élevé.').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Au moins un champ à modifier est requis.' });

export const createInvoiceLineSchema = z.object({
  rawLabel: z.string().min(1, 'Libellé requis.'),
  productId: z.string().min(1).nullable().optional(),
  quantity: z.coerce.number().positive('La quantité doit être positive.').max(DECIMAL_10_4_MAX, 'Quantité trop élevée.'),
  unitPriceHT: z.coerce
    .number()
    .nonnegative('Le prix unitaire doit être positif ou nul.')
    .max(DECIMAL_10_4_MAX, 'Prix unitaire trop élevé.'),
  totalPriceHT: z.coerce
    .number()
    .nonnegative('Le prix total doit être positif ou nul.')
    .max(DECIMAL_10_2_MAX, 'Prix total trop élevé.'),
});

export const updateInvoiceLineSchema = z
  .object({
    rawLabel: z.string().min(1).optional(),
    productId: z.string().min(1).nullable().optional(),
    quantity: z.coerce.number().positive().max(DECIMAL_10_4_MAX, 'Quantité trop élevée.').optional(),
    unitPriceHT: z.coerce.number().nonnegative().max(DECIMAL_10_4_MAX, 'Prix unitaire trop élevé.').optional(),
    totalPriceHT: z.coerce.number().nonnegative().max(DECIMAL_10_2_MAX, 'Prix total trop élevé.').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Au moins un champ à modifier est requis.' });

export type PatchInvoiceInput = z.infer<typeof patchInvoiceSchema>;
export type CreateInvoiceLineInput = z.infer<typeof createInvoiceLineSchema>;
export type UpdateInvoiceLineInput = z.infer<typeof updateInvoiceLineSchema>;
