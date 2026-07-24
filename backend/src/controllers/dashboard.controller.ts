import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { potentialSavingToReachGreen } from '../lib/margin';
import { getRestaurantThresholds } from '../lib/restaurantThresholds';
import { computeMenuItemMargin } from './menuItem.controller';

// Vue agrégée "Santé des marges" : ne renvoie que les plats actifs
// (un plat retiré de la carte ne doit pas polluer les KPIs du gérant)
// et uniquement ceux dont la fiche technique est renseignée — un plat
// sans fiche technique n'a pas de marge calculable, il est compté à
// part pour inciter à compléter la fiche plutôt que d'être ignoré
// silencieusement.
export async function getDashboard(req: Request, res: Response) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [menuItems, thresholds, wasteAggregate] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: req.user!.restaurantId, isActive: true },
      include: { recipe: { include: { ingredients: { include: { product: true } } } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    getRestaurantThresholds(req.user!.restaurantId),
    // Impact chiffré du gaspillage sur la marge du mois (Phase 5) :
    // affiché ici plutôt que seulement sur l'écran dédié, puisque c'est
    // littéralement de la marge perdue.
    prisma.wasteEntry.aggregate({
      where: { restaurantId: req.user!.restaurantId, declaredAt: { gte: monthStart, lt: monthEnd } },
      _sum: { estimatedValue: true },
    }),
  ]);

  const withMargin = menuItems.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    sellingPriceTTC: item.sellingPriceTTC,
    margin: computeMenuItemMargin(item, thresholds),
  }));

  const missingRecipeCount = withMargin.filter((i) => i.margin === null).length;
  const withMarginOnly = withMargin.filter(
    (i): i is typeof i & { margin: NonNullable<(typeof i)['margin']> } => i.margin !== null,
  );

  const greenCount = withMarginOnly.filter((i) => i.margin.status === 'GREEN').length;
  const orangeCount = withMarginOnly.filter((i) => i.margin.status === 'ORANGE').length;
  const redCount = withMarginOnly.filter((i) => i.margin.status === 'RED').length;

  const averageMarginRatio =
    withMarginOnly.length > 0
      ? withMarginOnly.reduce((sum, i) => sum + i.margin.marginRatio, 0) / withMarginOnly.length
      : null;

  // "Économies potentielles" : somme, pour les plats orange et rouge,
  // du coût matière qu'il faudrait économiser (au prix de vente actuel)
  // pour ramener chaque plat au seuil vert.
  const potentialSavings = withMarginOnly
    .filter((i) => i.margin.status !== 'GREEN')
    .reduce(
      (sum, i) => sum + potentialSavingToReachGreen(Number(i.sellingPriceTTC), i.margin.costHT, thresholds),
      0,
    );

  res.json({
    thresholds,
    kpis: {
      totalActiveMenuItems: menuItems.length,
      missingRecipeCount,
      greenCount,
      orangeCount,
      redCount,
      averageMarginRatio,
      potentialSavings,
      wasteThisMonth: Number(wasteAggregate._sum.estimatedValue ?? 0),
    },
    menuItems: withMargin,
  });
}
