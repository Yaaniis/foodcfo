import { z } from 'zod';
import { DECIMAL_10_2_MAX } from './decimalLimits';

// Taux de TVA français applicables en restauration (décision Phase 0 /
// règles métier du prompt d'origine : 5,5% à emporter, 10% sur place,
// 20% alcool). Modifiable par plat, jamais figé en dur ailleurs.
export const vatRateSchema = z.enum(['TAUX_5_5', 'TAUX_10', 'TAUX_20']);

// Les 14 allergènes à déclaration obligatoire en France/UE (règlement INCO).
export const allergenSchema = z.enum([
  'GLUTEN',
  'CRUSTACES',
  'OEUFS',
  'POISSON',
  'ARACHIDES',
  'SOJA',
  'LAIT',
  'FRUITS_A_COQUE',
  'CELERI',
  'MOUTARDE',
  'SESAME',
  'SULFITES',
  'LUPIN',
  'MOLLUSQUES',
]);

export const createMenuItemSchema = z.object({
  name: z.string().min(1, 'Nom du plat requis.'),
  category: z.string().min(1, 'Catégorie requise.'),
  sellingPriceTTC: z.coerce
    .number()
    .positive('Le prix de vente doit être positif.')
    .max(DECIMAL_10_2_MAX, 'Prix de vente trop élevé.'),
  vatRate: vatRateSchema,
  allergens: z.array(allergenSchema).default([]),
});

export const updateMenuItemSchema = z
  .object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    sellingPriceTTC: z.coerce.number().positive().max(DECIMAL_10_2_MAX, 'Prix de vente trop élevé.').optional(),
    vatRate: vatRateSchema.optional(),
    allergens: z.array(allergenSchema).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ à modifier est requis.',
  });

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
