import { z } from 'zod';
import { DECIMAL_10_2_MAX, DECIMAL_10_4_MAX } from './decimalLimits';

// Doit rester synchronisé avec l'enum PosProvider de schema.prisma —
// les 5 systèmes de caisse tranchés le 04/08/2026 après recherche du
// marché français réel (voir FoodCFO_PLAN.md, Phase 9).
export const posProviderSchema = z.enum(['LIGHTSPEED', 'LADDITION', 'ZELTY', 'INNOVORDER', 'CLYO_SYSTEMS']);

export const createPosConnectionSchema = z.object({
  provider: posProviderSchema,
});

export const updatePosSaleLineItemSchema = z
  .object({
    menuItemId: z.string().min(1).nullable().optional(),
    quantity: z.coerce.number().positive('La quantité doit être positive.').max(DECIMAL_10_4_MAX, 'Quantité trop élevée.').optional(),
    unitPriceTTC: z.coerce
      .number()
      .nonnegative('Le prix unitaire doit être positif ou nul.')
      .max(DECIMAL_10_2_MAX, 'Prix unitaire trop élevé.')
      .optional(),
    totalPriceTTC: z.coerce
      .number()
      .nonnegative('Le prix total doit être positif ou nul.')
      .max(DECIMAL_10_2_MAX, 'Prix total trop élevé.')
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Au moins un champ à modifier est requis.' });

export type CreatePosConnectionInput = z.infer<typeof createPosConnectionSchema>;
export type UpdatePosSaleLineItemInput = z.infer<typeof updatePosSaleLineItemSchema>;
