import { describe, it, expect } from 'vitest';
import { createMenuItemSchema, updateMenuItemSchema } from './menuItem.schemas';

describe('createMenuItemSchema', () => {
  it('accepte un plat valide', () => {
    const result = createMenuItemSchema.safeParse({
      name: 'Saumon grillé',
      category: 'Plats',
      sellingPriceTTC: 21.5,
      vatRate: 'TAUX_10',
      allergens: ['POISSON', 'LAIT'],
    });
    expect(result.success).toBe(true);
  });

  it("applique un tableau d'allergènes vide par défaut si omis", () => {
    const result = createMenuItemSchema.parse({
      name: 'Eau minérale',
      category: 'Boissons',
      sellingPriceTTC: 3,
      vatRate: 'TAUX_10',
    });
    expect(result.allergens).toEqual([]);
  });

  it('rejette un prix de vente négatif ou nul', () => {
    const result = createMenuItemSchema.safeParse({
      name: 'Plat test',
      category: 'Plats',
      sellingPriceTTC: -5,
      vatRate: 'TAUX_10',
    });
    expect(result.success).toBe(false);
  });

  it("rejette un taux de TVA qui n'existe pas en France", () => {
    const result = createMenuItemSchema.safeParse({
      name: 'Plat test',
      category: 'Plats',
      sellingPriceTTC: 12,
      vatRate: 'TAUX_20_STANDARD',
    });
    expect(result.success).toBe(false);
  });

  it('rejette un nom vide', () => {
    const result = createMenuItemSchema.safeParse({
      name: '',
      category: 'Plats',
      sellingPriceTTC: 12,
      vatRate: 'TAUX_10',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateMenuItemSchema', () => {
  it('accepte une mise à jour partielle (un seul champ)', () => {
    const result = updateMenuItemSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it('rejette un objet vide (aucun champ à modifier)', () => {
    const result = updateMenuItemSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
