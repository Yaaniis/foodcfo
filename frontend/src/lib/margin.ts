// Miroir côté client de backend/src/lib/margin.ts — permet un recalcul
// de marge en direct pendant la saisie (fiche technique, ajustement de
// prix) sans aller-retour réseau à chaque frappe. La source de vérité
// reste le backend (valeurs renvoyées par l'API et affichées ailleurs
// dans l'app) ; ce module ne sert qu'à la prévisualisation immédiate.

export type MarginStatus = 'GREEN' | 'ORANGE' | 'RED';

const VAT_RATE_DECIMALS: Record<string, number> = {
  TAUX_5_5: 0.055,
  TAUX_10: 0.1,
  TAUX_20: 0.2,
};

export interface MarginPreview {
  costHT: number;
  sellingPriceHT: number;
  marginEuros: number;
  marginRatio: number;
  coefficient: number | null;
  status: MarginStatus;
}

export interface MarginThresholds {
  greenThreshold: number;
  orangeThreshold: number;
}

export function computeMarginPreview(
  sellingPriceTTC: number,
  vatRate: string,
  ingredients: { quantity: number; unitPriceHT: number }[],
  thresholds: MarginThresholds,
): MarginPreview {
  const costHT = ingredients.reduce((sum, i) => sum + i.quantity * i.unitPriceHT, 0);
  const vatDecimal = VAT_RATE_DECIMALS[vatRate] ?? 0.1;
  const sellingPriceHT = sellingPriceTTC / (1 + vatDecimal);
  const marginEuros = sellingPriceTTC - costHT;
  const marginRatio = sellingPriceTTC > 0 ? (marginEuros / sellingPriceTTC) * 100 : 0;
  const coefficient = costHT > 0 ? sellingPriceTTC / costHT : null;

  let status: MarginStatus;
  if (marginRatio >= thresholds.greenThreshold) status = 'GREEN';
  else if (marginRatio >= thresholds.orangeThreshold) status = 'ORANGE';
  else status = 'RED';

  return { costHT, sellingPriceHT, marginEuros, marginRatio, coefficient, status };
}

export const MARGIN_STATUS_STYLES: Record<MarginStatus, string> = {
  GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ORANGE: 'bg-amber-50 text-amber-700 border-amber-200',
  RED: 'bg-red-50 text-red-700 border-red-200',
};

export const MARGIN_STATUS_LABELS: Record<MarginStatus, string> = {
  GREEN: 'Bonne marge',
  ORANGE: 'À surveiller',
  RED: 'Alerte',
};
