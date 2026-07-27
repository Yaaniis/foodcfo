import { describe, it, expect } from 'vitest';
import { createProductSchema } from './product.schemas';

describe('createProductSchema', () => {
  it('accepte un produit valide', () => {
    const result = createProductSchema.safeParse({
      supplierId: 'sup-1',
      name: 'Filet de bœuf',
      unit: 'KG',
      currentPriceHT: 28.5,
    });
    expect(result.success).toBe(true);
  });

  it('rejette un prix négatif ou nul', () => {
    const result = createProductSchema.safeParse({
      supplierId: 'sup-1',
      name: 'Filet de bœuf',
      unit: 'KG',
      currentPriceHT: 0,
    });
    expect(result.success).toBe(false);
  });

  // Product.currentPriceHT est un Decimal(10,4) côté Prisma (max
  // 999 999,9999) — sans cette borne côté Zod, une faute de frappe
  // tactile sur tablette faisait échouer l'écriture Prisma avec un 500
  // opaque au lieu d'un 400 clair.
  it('rejette un prix dépassant la précision Decimal(10,4) de la base', () => {
    const result = createProductSchema.safeParse({
      supplierId: 'sup-1',
      name: 'Filet de bœuf',
      unit: 'KG',
      currentPriceHT: 1_000_000,
    });
    expect(result.success).toBe(false);
  });
});
