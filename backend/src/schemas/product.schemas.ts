import { z } from 'zod';

export const productUnitSchema = z.enum(['KG', 'G', 'L', 'ML', 'UNITE']);

export const createProductSchema = z.object({
  supplierId: z.string().min(1, 'Fournisseur requis.'),
  name: z.string().min(1, 'Nom du produit requis.'),
  unit: productUnitSchema,
  currentPriceHT: z.coerce.number().positive('Le prix doit être positif.'),
});

// currentPriceHT reste modifiable ici (contrairement à ce qu'on
// pourrait penser vu la Phase 3) : ce champ n'est qu'une correction de
// saisie sur la fiche produit, pas un achat — la source de vérité de
// l'historique des prix (PriceHistory, déclenchée par la validation
// d'une facture) n'est pas affectée par ce endpoint.
export const updateProductSchema = z
  .object({
    supplierId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    unit: productUnitSchema.optional(),
    currentPriceHT: z.coerce.number().positive('Le prix doit être positif.').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ à modifier est requis.',
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
