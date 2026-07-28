// Calculs de marge — cœur métier de la Phase 2 ("Santé des marges").
// Fonctions pures (aucun accès base de données ici) pour rester
// facilement testables unitairement : une erreur ici est une perte
// d'argent réelle pour le restaurateur, donc zéro dépendance cachée.
//
// Règles métier (voir FoodCFO_PLAN.md, Phase 2) :
// - coût matière HT = somme(quantité ingrédient × prix unitaire HT du produit)
// - marge (€) = prix de vente TTC − coût matière HT
// - taux de marge (%) = marge € / prix de vente TTC × 100 — c'est cette
//   valeur qui est comparée aux seuils vert/orange/rouge du restaurant
//   (Restaurant.marginGreenThreshold / marginOrangeThreshold, décision 0.6)
// - coefficient multiplicateur = prix de vente TTC / coût matière HT
//   (métrique classique de restauration française)

export type VatRate = 'TAUX_5_5' | 'TAUX_10' | 'TAUX_20';
export type MarginStatus = 'GREEN' | 'ORANGE' | 'RED';

export const VAT_RATE_DECIMALS: Record<VatRate, number> = {
  TAUX_5_5: 0.055,
  TAUX_10: 0.1,
  TAUX_20: 0.2,
};

export interface MarginIngredientInput {
  quantity: number;
  unitPriceHT: number;
}

export interface MarginThresholds {
  greenThreshold: number;
  orangeThreshold: number;
}

export interface MarginResult {
  costHT: number;
  sellingPriceHT: number;
  marginEuros: number;
  marginRatio: number;
  // null quand le coût matière est nul (aucun ingrédient) : le
  // coefficient n'a alors pas de sens (division par zéro évitée).
  coefficient: number | null;
  status: MarginStatus;
}

export function computeIngredientsCostHT(ingredients: MarginIngredientInput[]): number {
  return ingredients.reduce((sum, i) => sum + i.quantity * i.unitPriceHT, 0);
}

export function marginStatusFromRatio(marginRatio: number, thresholds: MarginThresholds): MarginStatus {
  if (marginRatio >= thresholds.greenThreshold) return 'GREEN';
  if (marginRatio >= thresholds.orangeThreshold) return 'ORANGE';
  return 'RED';
}

export function computeMargin(
  sellingPriceTTC: number,
  vatRate: VatRate,
  ingredients: MarginIngredientInput[],
  thresholds: MarginThresholds,
): MarginResult {
  const costHT = computeIngredientsCostHT(ingredients);
  const sellingPriceHT = sellingPriceTTC / (1 + VAT_RATE_DECIMALS[vatRate]);
  const marginEuros = sellingPriceTTC - costHT;
  const marginRatio = sellingPriceTTC > 0 ? (marginEuros / sellingPriceTTC) * 100 : 0;
  const coefficient = costHT > 0 ? sellingPriceTTC / costHT : null;

  return {
    costHT,
    sellingPriceHT,
    marginEuros,
    marginRatio,
    coefficient,
    status: marginStatusFromRatio(marginRatio, thresholds),
  };
}

// Montant de coût matière (€ HT) qu'il faudrait économiser, au prix de
// vente actuel, pour ramener le plat au seuil vert. Sert au KPI
// "économies potentielles" du tableau de bord. Toujours ≥ 0 : un plat
// déjà vert ne "coûte" rien à améliorer.
export function potentialSavingToReachGreen(
  sellingPriceTTC: number,
  costHT: number,
  thresholds: MarginThresholds,
): number {
  const requiredCostHT = sellingPriceTTC * (1 - thresholds.greenThreshold / 100);
  return Math.max(0, costHT - requiredCostHT);
}

// Calcule la marge d'un plat à partir de sa fiche technique (le cas
// "pas encore de fiche technique" renvoie null : impossible de calculer
// un coût matière sans ingrédients, voir commentaire sur MenuItem.recipe
// dans le schéma Prisma). Vit ici (pas dans menuItem.controller.ts) pour
// rester importable depuis d'autres fonctions pures de lib/ (voir
// lib/marginAlerts.ts) sans dépendance circulaire lib → controller.
export type MenuItemWithRecipe = {
  sellingPriceTTC: unknown;
  vatRate: VatRate;
  recipe: { ingredients: { quantity: unknown; product: { currentPriceHT: unknown } }[] } | null;
};

export function computeMenuItemMargin(
  menuItem: MenuItemWithRecipe,
  thresholds: MarginThresholds,
): MarginResult | null {
  if (!menuItem.recipe || menuItem.recipe.ingredients.length === 0) {
    return null;
  }
  const ingredients = menuItem.recipe.ingredients.map((i) => ({
    quantity: Number(i.quantity),
    unitPriceHT: Number(i.product.currentPriceHT),
  }));
  return computeMargin(Number(menuItem.sellingPriceTTC), menuItem.vatRate, ingredients, thresholds);
}
