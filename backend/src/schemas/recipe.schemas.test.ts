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

  // RecipeIngredient.quantity est un Decimal(10,4) côté Prisma (max
  // 999 999,9999) — sans cette borne côté Zod, une faute de frappe
  // faisait échouer l'écriture Prisma avec un 500 opaque au lieu d'un
  // 400 clair.
  it('rejette une quantité dépassant la précision Decimal(10,4) de la base', () => {
    const result = upsertRecipeSchema.safeParse({
      ingredients: [{ productId: 'prod-1', quantity: 1_000_000 }],
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
