import { z } from 'zod';

const wasteReasonSchema = z.enum(['PERIME', 'ERREUR_PREPARATION', 'INVENDU', 'AUTRE']);

// Une perte concerne soit un produit brut (ex: poisson périmé), soit un
// plat fini (ex: assiette invendue) — jamais les deux à la fois, sinon
// on ne saurait pas sur quelle base valoriser la perte (prix du produit
// vs coût matière de la recette).
export const createWasteEntrySchema = z
  .object({
    productId: z.string().min(1).optional(),
    menuItemId: z.string().min(1).optional(),
    quantity: z.coerce.number().positive('La quantité doit être positive.'),
    reason: wasteReasonSchema,
  })
  .refine((data) => Boolean(data.productId) !== Boolean(data.menuItemId), {
    message: "Renseigner soit un produit, soit un plat — jamais les deux, ni aucun des deux.",
    path: ['productId'],
  });

export type CreateWasteEntryInput = z.infer<typeof createWasteEntrySchema>;
