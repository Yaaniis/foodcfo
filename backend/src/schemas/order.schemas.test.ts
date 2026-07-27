import { describe, it, expect } from 'vitest';
import { createOrdersFromCartSchema } from './order.schemas';

describe('createOrdersFromCartSchema', () => {
  it('accepte un panier valide', () => {
    const result = createOrdersFromCartSchema.safeParse({
      items: [{ productId: 'prod-1', quantity: 5 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejette un panier vide', () => {
    const result = createOrdersFromCartSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  // OrderLineItem.quantity est un Decimal(10,4) côté Prisma (max
  // 999 999,9999) — sans cette borne côté Zod, une faute de frappe
  // faisait échouer l'écriture Prisma avec un 500 opaque au lieu d'un
  // 400 clair.
  it('rejette une quantité dépassant la précision Decimal(10,4) de la base', () => {
    const result = createOrdersFromCartSchema.safeParse({
      items: [{ productId: 'prod-1', quantity: 1_000_000 }],
    });
    expect(result.success).toBe(false);
  });
});
