import { describe, it, expect } from 'vitest';
import { upsertRecipeSchema } from './recipe.schemas';

describe('upsertRecipeSchema', () => {
  it("accepte une liste d'ingrédients valide", () => {
    const result = upsertRecipeSchema.safeParse({
      ingredients: [
        { productId: 'prod-1', quantity: 0.2 },
        { productId: 'prod-2', quantity: 0.05 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejette une fiche technique sans aucun ingrédient (une recette vide n'a pas de sens)", () => {
    const result = upsertRecipeSchema.safeParse({ ingredients: [] });
    expect(result.success).toBe(false);
  });

  it('rejette une quantité négative ou nulle (une quantité à 0 ne devrait pas exister dans une recette)', () => {
    const result = upsertRecipeSchema.safeParse({
      ingredients: [{ productId: 'prod-1', quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejette un ingrédient sans productId', () => {
    const result = upsertRecipeSchema.safeParse({
      ingredients: [{ quantity: 0.1 }],
    });
    expect(result.success).toBe(false);
  });
});
