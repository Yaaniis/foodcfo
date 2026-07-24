import { describe, it, expect } from 'vitest';
import { computeMargin, computeIngredientsCostHT, marginStatusFromRatio, potentialSavingToReachGreen } from './margin';

const DEFAULT_THRESHOLDS = { greenThreshold: 70, orangeThreshold: 60 };

describe('computeIngredientsCostHT', () => {
  it("additionne quantité × prix unitaire pour chaque ingrédient", () => {
    const cost = computeIngredientsCostHT([
      { quantity: 0.18, unitPriceHT: 28.5 },
      { quantity: 0.05, unitPriceHT: 12 },
    ]);
    expect(cost).toBeCloseTo(5.13 + 0.6, 4);
  });

  it('renvoie 0 pour une liste vide (plat sans fiche technique renseignée)', () => {
    expect(computeIngredientsCostHT([])).toBe(0);
  });
});

describe('marginStatusFromRatio', () => {
  it('vert quand le taux de marge atteint exactement le seuil vert', () => {
    expect(marginStatusFromRatio(70, DEFAULT_THRESHOLDS)).toBe('GREEN');
  });

  it('orange juste en dessous du seuil vert', () => {
    expect(marginStatusFromRatio(69.99, DEFAULT_THRESHOLDS)).toBe('ORANGE');
  });

  it('orange quand le taux atteint exactement le seuil orange', () => {
    expect(marginStatusFromRatio(60, DEFAULT_THRESHOLDS)).toBe('ORANGE');
  });

  it('rouge juste en dessous du seuil orange', () => {
    expect(marginStatusFromRatio(59.99, DEFAULT_THRESHOLDS)).toBe('RED');
  });

  it('rouge pour une marge négative (plat vendu à perte)', () => {
    expect(marginStatusFromRatio(-10, DEFAULT_THRESHOLDS)).toBe('RED');
  });
});

describe('computeMargin', () => {
  it('calcule correctement un plat bien margé (cas Tartare de bœuf de la revue manuelle)', () => {
    const result = computeMargin(24, 'TAUX_10', [{ quantity: 0.18, unitPriceHT: 28.5 }], DEFAULT_THRESHOLDS);

    expect(result.costHT).toBeCloseTo(5.13, 4);
    expect(result.sellingPriceHT).toBeCloseTo(24 / 1.1, 4);
    expect(result.marginEuros).toBeCloseTo(24 - 5.13, 4);
    expect(result.marginRatio).toBeCloseTo(((24 - 5.13) / 24) * 100, 4);
    expect(result.coefficient).toBeCloseTo(24 / 5.13, 4);
    expect(result.status).toBe('GREEN');
  });

  it('détecte un plat en alerte rouge (coût matière trop élevé)', () => {
    // Coût matière (10) proche du prix de vente (12) → marge très faible.
    const result = computeMargin(12, 'TAUX_10', [{ quantity: 1, unitPriceHT: 10 }], DEFAULT_THRESHOLDS);
    expect(result.marginRatio).toBeCloseTo(((12 - 10) / 12) * 100, 4);
    expect(result.status).toBe('RED');
  });

  it('coefficient à null quand le coût matière est nul (division par zéro évitée)', () => {
    const result = computeMargin(15, 'TAUX_10', [], DEFAULT_THRESHOLDS);
    expect(result.costHT).toBe(0);
    expect(result.coefficient).toBeNull();
    expect(result.marginEuros).toBe(15);
    expect(result.status).toBe('GREEN');
  });

  it('applique le bon taux de TVA pour le prix de vente HT (20% alcool)', () => {
    const result = computeMargin(10, 'TAUX_20', [{ quantity: 1, unitPriceHT: 2 }], DEFAULT_THRESHOLDS);
    expect(result.sellingPriceHT).toBeCloseTo(10 / 1.2, 4);
  });

  it('respecte les seuils personnalisés du restaurant (pas de valeur figée en dur)', () => {
    const customThresholds = { greenThreshold: 80, orangeThreshold: 75 };
    const result = computeMargin(24, 'TAUX_10', [{ quantity: 0.18, unitPriceHT: 28.5 }], customThresholds);
    // Même plat que le premier test (marge ≈ 78,6%) : vert avec les seuils
    // par défaut (70/60), mais seulement orange ici (en dessous de 80%).
    expect(result.status).toBe('ORANGE');
  });
});

describe('potentialSavingToReachGreen', () => {
  it("renvoie 0 pour un plat déjà vert (rien à économiser)", () => {
    const saving = potentialSavingToReachGreen(24, 5.13, DEFAULT_THRESHOLDS);
    expect(saving).toBe(0);
  });

  it("calcule le montant à économiser pour un plat sous le seuil vert", () => {
    // Prix 12€, coût 10€ → il faudrait un coût ≤ 12 × (1 - 0.70) = 3.6€
    // pour atteindre le seuil vert à 70%. Économie requise : 10 - 3.6 = 6.4€.
    const saving = potentialSavingToReachGreen(12, 10, DEFAULT_THRESHOLDS);
    expect(saving).toBeCloseTo(6.4, 4);
  });
});
