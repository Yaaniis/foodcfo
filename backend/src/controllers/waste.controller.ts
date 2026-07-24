import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { computeIngredientsCostHT } from '../lib/margin';
import { createWasteEntrySchema } from '../schemas/waste.schemas';

const WASTE_ENTRY_INCLUDE = {
  product: { select: { id: true, name: true, unit: true, supplier: { select: { category: true } } } },
  menuItem: { select: { id: true, name: true, category: true } },
} as const;

// La valeur estimée d'une perte n'est jamais saisie par l'utilisateur :
// elle est calculée côté serveur pour rester cohérente avec les prix
// réels du catalogue, plutôt que de dépendre d'une estimation manuelle
// approximative.
// - Produit brut : quantité × prix d'achat HT du produit.
// - Plat fini : quantité × coût matière HT de sa fiche technique (ce
//   qu'a réellement coûté le plat jeté, pas son prix de vente — jeter
//   un plat ne fait pas perdre le chiffre d'affaires qu'on n'a jamais
//   encaissé, seulement le coût des ingrédients).
async function computeEstimatedValue(
  restaurantId: string,
  input: { productId?: string; menuItemId?: string; quantity: number },
): Promise<number | { error: 'NOT_FOUND'; message: string } | { error: 'NO_RECIPE'; message: string }> {
  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, restaurantId },
    });
    if (!product) {
      return { error: 'NOT_FOUND', message: 'Produit introuvable.' };
    }
    return input.quantity * Number(product.currentPriceHT);
  }

  const menuItem = await prisma.menuItem.findFirst({
    where: { id: input.menuItemId, restaurantId },
    include: { recipe: { include: { ingredients: { include: { product: true } } } } },
  });
  if (!menuItem) {
    return { error: 'NOT_FOUND', message: 'Plat introuvable.' };
  }
  if (!menuItem.recipe || menuItem.recipe.ingredients.length === 0) {
    return {
      error: 'NO_RECIPE',
      message: "Ce plat n'a pas de fiche technique renseignée — impossible de valoriser la perte.",
    };
  }

  const costHT = computeIngredientsCostHT(
    menuItem.recipe.ingredients.map((i) => ({ quantity: Number(i.quantity), unitPriceHT: Number(i.product.currentPriceHT) })),
  );
  return input.quantity * costHT;
}

export async function createWasteEntry(req: Request, res: Response) {
  const input = createWasteEntrySchema.parse(req.body);

  const valueOrError = await computeEstimatedValue(req.user!.restaurantId, input);
  if (typeof valueOrError !== 'number') {
    return res.status(valueOrError.error === 'NOT_FOUND' ? 404 : 400).json(valueOrError);
  }

  const entry = await prisma.wasteEntry.create({
    data: {
      restaurantId: req.user!.restaurantId,
      productId: input.productId ?? null,
      menuItemId: input.menuItemId ?? null,
      quantity: input.quantity,
      estimatedValue: valueOrError,
      reason: input.reason,
      declaredById: req.user!.id,
    },
    include: WASTE_ENTRY_INCLUDE,
  });

  res.status(201).json({ wasteEntry: entry });
}

export async function listWasteEntries(req: Request, res: Response) {
  const entries = await prisma.wasteEntry.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: WASTE_ENTRY_INCLUDE,
    orderBy: { declaredAt: 'desc' },
  });
  res.json({ wasteEntries: entries });
}

// "Catégorie" d'une perte : la catégorie du fournisseur pour un produit
// brut (ex: "Boucherie"), la catégorie du plat pour un produit fini
// (ex: "Desserts") — ce sont les deux seuls champs de catégorie qui
// existent réellement dans le modèle de données.
export async function getWasteStats(req: Request, res: Response) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const entries = await prisma.wasteEntry.findMany({
    where: { restaurantId: req.user!.restaurantId, declaredAt: { gte: monthStart, lt: monthEnd } },
    include: WASTE_ENTRY_INCLUDE,
  });

  const byReason: Record<string, number> = { PERIME: 0, ERREUR_PREPARATION: 0, INVENDU: 0, AUTRE: 0 };
  const byCategory = new Map<string, number>();
  let totalValue = 0;

  for (const entry of entries) {
    const value = Number(entry.estimatedValue);
    totalValue += value;
    byReason[entry.reason] += value;

    const category = entry.product?.supplier.category ?? entry.menuItem?.category ?? 'Non catégorisé';
    byCategory.set(category, (byCategory.get(category) ?? 0) + value);
  }

  res.json({
    month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
    entryCount: entries.length,
    totalValue,
    byReason,
    byCategory: Array.from(byCategory.entries()).map(([category, value]) => ({ category, value })),
  });
}
