import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createSupplierSchema, updateSupplierSchema } from '../schemas/supplier.schemas';

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

export async function updateSupplier(req: Request, res: Response) {
  const input = updateSupplierSchema.parse(req.body);

  const existing = await prisma.supplier.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Fournisseur introuvable.' });
  }

  const supplier = await prisma.supplier.update({
    where: { id: existing.id },
    data: {
      ...input,
      contactEmail: input.contactEmail === '' ? null : input.contactEmail,
    },
  });
  res.json({ supplier });
}

// Désactivation (isActive: false) plutôt qu'une suppression physique :
// les produits déjà rattachés à ce fournisseur (onDelete: Restrict)
// resteraient de toute façon bloquants, et l'historique des factures
// déjà validées pour ce fournisseur doit survivre intact — même
// principe que la désactivation d'un utilisateur (User.isActive).
export async function deleteSupplier(req: Request, res: Response) {
  const existing = await prisma.supplier.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Fournisseur introuvable.' });
  }

  await prisma.supplier.update({ where: { id: existing.id }, data: { isActive: false } });
  res.status(204).send();
}
