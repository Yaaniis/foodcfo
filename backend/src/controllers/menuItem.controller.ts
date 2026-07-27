import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createMenuItemSchema, updateMenuItemSchema } from '../schemas/menuItem.schemas';
import { computeMargin, type VatRate } from '../lib/margin';
import { getRestaurantThresholds } from '../lib/restaurantThresholds';

// Le Service consulte la carte en lecture seule (décision 0.5) : nom,
// prix de vente, allergènes. Ni la marge (calculée) ni la fiche
// technique (dont chaque ingrédient porte le prix d'achat du produit,
// Product.currentPriceHT) ne lui sont destinées — recalculer la marge
// à la main à partir des prix d'achat resterait possible si on se
// contentait de masquer `margin` seul. Fait ici plutôt que seulement
// dans l'UI, pour ne pas dépendre uniquement du frontend (visible
// sinon via les DevTools).
function sanitizeMenuItemForRole<T extends Parameters<typeof computeMenuItemMargin>[0]>(
  item: T,
  role: string,
  thresholds: { greenThreshold: number; orangeThreshold: number },
): T & { margin: ReturnType<typeof computeMenuItemMargin> } {
  if (role === 'SERVICE') {
    return { ...item, recipe: null, margin: null };
  }
  return { ...item, margin: computeMenuItemMargin(item, thresholds) };
}

export async function listMenuItems(req: Request, res: Response) {
  const [menuItems, thresholds] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: req.user!.restaurantId },
      include: { recipe: { include: { ingredients: { include: { product: true } } } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    getRestaurantThresholds(req.user!.restaurantId),
  ]);

  res.json({
    menuItems: menuItems.map((item) => sanitizeMenuItemForRole(item, req.user!.role, thresholds)),
  });
}

export async function getMenuItem(req: Request, res: Response) {
  const [menuItem, thresholds] = await Promise.all([
    prisma.menuItem.findFirst({
      where: { id: req.params.id, restaurantId: req.user!.restaurantId },
      include: { recipe: { include: { ingredients: { include: { product: true } } } } },
    }),
    getRestaurantThresholds(req.user!.restaurantId),
  ]);
  if (!menuItem) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Plat introuvable.' });
  }
  res.json({ menuItem: sanitizeMenuItemForRole(menuItem, req.user!.role, thresholds) });
}

// Calcule la marge d'un plat à partir de sa fiche technique (le cas
// "pas encore de fiche technique" renvoie null : impossible de calculer
// un coût matière sans ingrédients, voir commentaire sur MenuItem.recipe
// dans le schéma Prisma).
type MenuItemWithRecipe = {
  sellingPriceTTC: unknown;
  vatRate: VatRate;
  recipe: { ingredients: { quantity: unknown; product: { currentPriceHT: unknown } }[] } | null;
};

export function computeMenuItemMargin(
  menuItem: MenuItemWithRecipe,
  thresholds: { greenThreshold: number; orangeThreshold: number },
) {
  if (!menuItem.recipe || menuItem.recipe.ingredients.length === 0) {
    return null;
  }
  const ingredients = menuItem.recipe.ingredients.map((i) => ({
    quantity: Number(i.quantity),
    unitPriceHT: Number(i.product.currentPriceHT),
  }));
  return computeMargin(Number(menuItem.sellingPriceTTC), menuItem.vatRate, ingredients, thresholds);
}

export async function createMenuItem(req: Request, res: Response) {
  const input = createMenuItemSchema.parse(req.body);

  const menuItem = await prisma.menuItem.create({
    data: {
      restaurantId: req.user!.restaurantId,
      name: input.name,
      category: input.category,
      sellingPriceTTC: input.sellingPriceTTC,
      vatRate: input.vatRate,
      allergens: input.allergens,
    },
  });

  res.status(201).json({ menuItem });
}

// La Cuisine gère la fiche technique (nom, catégorie, allergènes,
// ingrédients) — décision 0.5 — mais pas la tarification client : le
// prix de vente TTC et son taux de TVA restent une décision du Gérant
// seul, comme tout le reste du pilotage financier de l'app (seuils de
// marge, export comptable, abonnement...). Vérifié après le parsing
// Zod (pas dans le schéma lui-même) pour renvoyer une erreur explicite
// plutôt que d'ignorer silencieusement les champs envoyés.
const PRICING_FIELDS = ['sellingPriceTTC', 'vatRate'] as const;

export async function updateMenuItem(req: Request, res: Response) {
  const input = updateMenuItemSchema.parse(req.body);

  if (req.user!.role !== 'GERANT' && PRICING_FIELDS.some((field) => input[field] !== undefined)) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Seul un Gérant peut modifier le prix de vente ou le taux de TVA d\'un plat.',
    });
  }

  const existing = await prisma.menuItem.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Plat introuvable.' });
  }

  const menuItem = await prisma.menuItem.update({ where: { id: existing.id }, data: input });
  res.json({ menuItem });
}

export async function deleteMenuItem(req: Request, res: Response) {
  const existing = await prisma.menuItem.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Plat introuvable.' });
  }

  await prisma.menuItem.delete({ where: { id: existing.id } });
  res.status(204).send();
}
