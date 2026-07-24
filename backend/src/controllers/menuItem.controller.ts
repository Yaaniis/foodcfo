import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createMenuItemSchema, updateMenuItemSchema } from '../schemas/menuItem.schemas';
import { computeMargin, type VatRate } from '../lib/margin';
import { getRestaurantThresholds } from '../lib/restaurantThresholds';

export async function listMenuItems(req: Request, res: Response) {
  const [menuItems, thresholds] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: req.user!.restaurantId },
      include: { recipe: { include: { ingredients: { include: { product: true } } } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    getRestaurantThresholds(req.user!.restaurantId),
  ]);

  res.json({ menuItems: menuItems.map((item) => ({ ...item, margin: computeMenuItemMargin(item, thresholds) })) });
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
  res.json({ menuItem: { ...menuItem, margin: computeMenuItemMargin(menuItem, thresholds) } });
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

export async function updateMenuItem(req: Request, res: Response) {
  const input = updateMenuItemSchema.parse(req.body);

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
