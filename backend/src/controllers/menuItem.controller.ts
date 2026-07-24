import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createMenuItemSchema, updateMenuItemSchema } from '../schemas/menuItem.schemas';

export async function listMenuItems(req: Request, res: Response) {
  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: { recipe: { include: { ingredients: true } } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  res.json({ menuItems });
}

export async function getMenuItem(req: Request, res: Response) {
  const menuItem = await prisma.menuItem.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    include: { recipe: { include: { ingredients: { include: { product: true } } } } },
  });
  if (!menuItem) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Plat introuvable.' });
  }
  res.json({ menuItem });
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
