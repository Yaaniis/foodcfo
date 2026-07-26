import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createProductSchema, updateProductSchema } from '../schemas/product.schemas';

export async function listProducts(req: Request, res: Response) {
  const products = await prisma.product.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ products });
}

export async function createProduct(req: Request, res: Response) {
  const input = createProductSchema.parse(req.body);

  // Vérifie que le fournisseur appartient bien au même restaurant
  // (isolation multi-tenant — ne jamais faire confiance à un ID fourni
  // par le client sans le confronter au restaurantId du token).
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, restaurantId: req.user!.restaurantId },
  });
  if (!supplier) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Fournisseur introuvable.' });
  }

  const product = await prisma.product.create({
    data: {
      restaurantId: req.user!.restaurantId,
      supplierId: input.supplierId,
      name: input.name,
      unit: input.unit,
      currentPriceHT: input.currentPriceHT,
    },
  });

  res.status(201).json({ product });
}

export async function updateProduct(req: Request, res: Response) {
  const input = updateProductSchema.parse(req.body);

  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Produit introuvable.' });
  }

  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, restaurantId: req.user!.restaurantId },
    });
    if (!supplier) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Fournisseur introuvable.' });
    }
  }

  const product = await prisma.product.update({ where: { id: existing.id }, data: input });
  res.json({ product });
}

export async function deleteProduct(req: Request, res: Response) {
  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Produit introuvable.' });
  }

  // Contrainte onDelete: Restrict sur RecipeIngredient/OrderLineItem —
  // un produit encore utilisé dans une fiche technique ou une commande
  // ne peut pas être supprimé (P2003), message explicite plutôt que de
  // laisser remonter une erreur générique.
  try {
    await prisma.product.delete({ where: { id: existing.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(409).json({
        error: 'PRODUCT_IN_USE',
        message: 'Ce produit est utilisé dans une fiche technique ou une commande, il ne peut pas être supprimé.',
      });
    }
    throw err;
  }

  res.status(204).send();
}
