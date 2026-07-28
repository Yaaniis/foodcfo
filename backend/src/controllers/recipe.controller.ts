import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { upsertRecipeSchema } from '../schemas/recipe.schemas';
import { checkMarginAlertsForMenuItems } from '../lib/marginAlerts';

// Remplace intégralement la fiche technique d'un plat (upsert) : plus
// simple et plus sûr qu'un diff ligne par ligne pour un formulaire où
// l'utilisateur réécrit toute la liste des ingrédients à chaque
// modification.
export async function upsertRecipe(req: Request, res: Response) {
  const { ingredients } = upsertRecipeSchema.parse(req.body);

  const menuItem = await prisma.menuItem.findFirst({
    where: { id: req.params.menuItemId, restaurantId: req.user!.restaurantId },
  });
  if (!menuItem) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Plat introuvable.' });
  }

  // Vérifie que tous les produits référencés appartiennent bien à ce
  // restaurant (isolation multi-tenant, même logique que pour les
  // fournisseurs/utilisateurs).
  const productIds = ingredients.map((i) => i.productId);
  const validProducts = await prisma.product.findMany({
    where: { id: { in: productIds }, restaurantId: req.user!.restaurantId },
    select: { id: true },
  });
  if (validProducts.length !== new Set(productIds).size) {
    return res.status(400).json({ error: 'INVALID_PRODUCT', message: 'Un ou plusieurs produits sont invalides.' });
  }

  const recipe = await prisma.recipe.upsert({
    where: { menuItemId: menuItem.id },
    create: {
      menuItemId: menuItem.id,
      ingredients: { create: ingredients.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
    },
    update: {
      ingredients: {
        deleteMany: {},
        create: ingredients.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      },
    },
    include: { ingredients: { include: { product: true } } },
  });

  // Un changement de recette (ingrédients ou quantités) modifie
  // directement le coût matière, donc la marge du plat.
  await checkMarginAlertsForMenuItems(prisma, req.user!.restaurantId, [menuItem.id]);

  res.json({ recipe });
}
