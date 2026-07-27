import { describe, it, expect } from 'vitest';
import { createInvoiceLineSchema, patchInvoiceSchema } from './invoice.schemas';

describe('createInvoiceLineSchema', () => {
  it('accepte une ligne valide', () => {
    const result = createInvoiceLineSchema.safeParse({
      rawLabel: 'Filet de bœuf 5kg',
      quantity: 5,
      unitPriceHT: 28.5,
      totalPriceHT: 142.5,
    });
    expect(result.success).toBe(true);
  });

  it('accepte un prix à 0€ (article offert par le fournisseur)', () => {
    const result = createInvoiceLineSchema.safeParse({
      rawLabel: 'Échantillon offert',
      quantity: 1,
      unitPriceHT: 0,
      totalPriceHT: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejette un prix unitaire négatif', () => {
    const result = createInvoiceLineSchema.safeParse({
      rawLabel: 'Remise',
      quantity: 1,
      unitPriceHT: -5,
      totalPriceHT: -5,
    });
    expect(result.success).toBe(false);
  });

  // InvoiceLineItem.quantity/unitPriceHT sont des Decimal(10,4) côté
  // Prisma (max 999 999,9999) — sans ces bornes côté Zod, une valeur
  // trop grande passait la validation puis faisait échouer l'écriture
  // Prisma avec un 500 opaque au lieu d'un 400 clair.
  it('rejette une quantité dépassant la précision Decimal(10,4) de la base', () => {
    const result = createInvoiceLineSchema.safeParse({
      rawLabel: 'Test',
      quantity: 1_000_000,
      unitPriceHT: 10,
      totalPriceHT: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejette un prix unitaire dépassant la précision Decimal(10,4) de la base', () => {
    const result = createInvoiceLineSchema.safeParse({
      rawLabel: 'Test',
      quantity: 1,
      unitPriceHT: 1_000_000,
      totalPriceHT: 10,
    });
    expect(result.success).toBe(false);
  });

  // InvoiceLineItem.totalPriceHT est un Decimal(10,2) côté Prisma (max
  // 99 999 999,99), une précision différente de quantity/unitPriceHT.
  it('rejette un prix total dépassant la précision Decimal(10,2) de la base', () => {
    const result = createInvoiceLineSchema.safeParse({
      rawLabel: 'Test',
      quantity: 1,
      unitPriceHT: 10,
      totalPriceHT: 100_000_000,
    });
    expect(result.success).toBe(false);
  });
});

describe('patchInvoiceSchema', () => {
  it('rejette un totalAmount dépassant la précision Decimal(10,2) de la base', () => {
    const result = patchInvoiceSchema.safeParse({ totalAmount: 100_000_000 });
    expect(result.success).toBe(false);
  });

  it('accepte un totalAmount valide', () => {
    const result = patchInvoiceSchema.safeParse({ totalAmount: 242 });
    expect(result.success).toBe(true);
  });
});
