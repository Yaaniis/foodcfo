import { describe, it, expect } from 'vitest';
import { createWasteEntrySchema } from './waste.schemas';

describe('createWasteEntrySchema', () => {
  it('accepte une déclaration valide pour un produit', () => {
    const result = createWasteEntrySchema.safeParse({
      productId: 'prod-1',
      quantity: 2,
      reason: 'PERIME',
    });
    expect(result.success).toBe(true);
  });

  it('rejette une déclaration sans produit ni plat', () => {
    const result = createWasteEntrySchema.safeParse({ quantity: 2, reason: 'PERIME' });
    expect(result.success).toBe(false);
  });

  // WasteEntry.quantity est un Decimal(10,4) côté Prisma (max
  // 999 999,9999) — sans cette borne côté Zod, une faute de frappe
  // faisait échouer l'écriture Prisma avec un 500 opaque au lieu d'un
  // 400 clair.
  it('rejette une quantité dépassant la précision Decimal(10,4) de la base', () => {
    const result = createWasteEntrySchema.safeParse({
      productId: 'prod-1',
      quantity: 1_000_000,
      reason: 'PERIME',
    });
    expect(result.success).toBe(false);
  });
});
