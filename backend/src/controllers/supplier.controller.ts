import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createSupplierSchema } from '../schemas/supplier.schemas';

export async function listSuppliers(req: Request, res: Response) {
  const suppliers = await prisma.supplier.findMany({
    where: { restaurantId: req.user!.restaurantId, isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json({ suppliers });
}

export async function createSupplier(req: Request, res: Response) {
  const input = createSupplierSchema.parse(req.body);

  const supplier = await prisma.supplier.create({
    data: {
      restaurantId: req.user!.restaurantId,
      name: input.name,
      category: input.category,
      preferredChannel: input.preferredChannel,
      contactEmail: input.contactEmail || null,
      contactPhone: input.contactPhone || null,
      notes: input.notes || null,
    },
  });

  res.status(201).json({ supplier });
}
