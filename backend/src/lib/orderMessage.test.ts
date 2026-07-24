import { describe, it, expect } from 'vitest';
import { buildOrderMessage } from './orderMessage';

describe('buildOrderMessage', () => {
  it('inclut le nom du restaurant dans le sujet', () => {
    const { subject } = buildOrderMessage('Le Bistrot Test', [{ productName: 'Filet de bœuf', quantity: 5, unit: 'KG' }]);
    expect(subject).toContain('Le Bistrot Test');
  });

  it('liste chaque ligne avec son unité lisible', () => {
    const { text } = buildOrderMessage('Le Bistrot Test', [
      { productName: 'Filet de bœuf', quantity: 5, unit: 'KG' },
      { productName: 'Œufs', quantity: 60, unit: 'UNITE' },
    ]);
    expect(text).toContain('- Filet de bœuf : 5 kg');
    expect(text).toContain('- Œufs : 60 unité(s)');
  });

  it("retombe sur le code brut de l'unité si elle est inconnue (robustesse)", () => {
    const { text } = buildOrderMessage('Le Bistrot Test', [
      { productName: 'Mystère', quantity: 1, unit: 'CAISSE' },
    ]);
    expect(text).toContain('- Mystère : 1 CAISSE');
  });
});
