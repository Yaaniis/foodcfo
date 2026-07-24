import { z } from 'zod';

export const patchInvoiceSchema = z
  .object({
    supplierId: z.string().min(1).nullable().optional(),
    invoiceDate: z.coerce.date().optional(),
    totalAmount: z.coerce.number().nonnegative().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Au moins un champ à modifier est requis.' });

export const createInvoiceLineSchema = z.object({
  rawLabel: z.string().min(1, 'Libellé requis.'),
  productId: z.string().min(1).nullable().optional(),
  quantity: z.coerce.number().positive('La quantité doit être positive.'),
  unitPriceHT: z.coerce.number().nonnegative('Le prix unitaire doit être positif ou nul.'),
  totalPriceHT: z.coerce.number().nonnegative('Le prix total doit être positif ou nul.'),
});

export const updateInvoiceLineSchema = z
  .object({
    rawLabel: z.string().min(1).optional(),
    productId: z.string().min(1).nullable().optional(),
    quantity: z.coerce.number().positive().optional(),
    unitPriceHT: z.coerce.number().nonnegative().optional(),
    totalPriceHT: z.coerce.number().nonnegative().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Au moins un champ à modifier est requis.' });

export type PatchInvoiceInput = z.infer<typeof patchInvoiceSchema>;
export type CreateInvoiceLineInput = z.infer<typeof createInvoiceLineSchema>;
export type UpdateInvoiceLineInput = z.infer<typeof updateInvoiceLineSchema>;
