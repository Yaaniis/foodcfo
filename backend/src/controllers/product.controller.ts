import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createProductSchema } from '../schemas/product.schemas';

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
