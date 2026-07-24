import { z } from 'zod';

export const productUnitSchema = z.enum(['KG', 'G', 'L', 'ML', 'UNITE']);

export const createProductSchema = z.object({
  supplierId: z.string().min(1, 'Fournisseur requis.'),
  name: z.string().min(1, 'Nom du produit requis.'),
  unit: productUnitSchema,
  currentPriceHT: z.coerce.number().positive('Le prix doit être positif.'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
