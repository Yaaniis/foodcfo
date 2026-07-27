import { z } from 'zod';
import { DECIMAL_10_4_MAX } from './decimalLimits';

export const recipeIngredientInputSchema = z.object({
  productId: z.string().min(1, 'Produit requis.'),
  quantity: z.coerce.number().positive('La quantité doit être positive.').max(DECIMAL_10_4_MAX, 'Quantité trop élevée.'),
});

// La fiche technique est remplacée intégralement à chaque sauvegarde
// (upsert) — plus simple et plus sûr qu'un diff ligne par ligne pour un
// formulaire où l'utilisateur réécrit toute la liste des ingrédients à
// chaque modification (voir recipe.controller.ts).
export const upsertRecipeSchema = z.object({
  ingredients: z.array(recipeIngredientInputSchema).min(1, 'Au moins un ingrédient est requis.'),
});

export type UpsertRecipeInput = z.infer<typeof upsertRecipeSchema>;
