import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createEmployeeAvailabilitySchema } from '../schemas/availability.schemas';

const AVAILABILITY_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, role: true } },
} as const;

export async function listEmployeeAvailabilities(req: Request, res: Response) {
  const availabilities = await prisma.employeeAvailability.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: AVAILABILITY_INCLUDE,
    orderBy: [{ createdAt: 'desc' }],
  });
  res.json({ availabilities });
}

export async function createEmployeeAvailability(req: Request, res: Response) {
  const input = createEmployeeAvailabilitySchema.parse(req.body);

  // Isolation multi-tenant : l'employé désigné doit appartenir au même
  // restaurant, jamais faire confiance à un userId fourni par le client
  // sans le confronter au restaurantId du token (même principe que
  // supplierId sur Product, productId sur RecipeIngredient, etc.).
  const user = await prisma.user.findFirst({
    where: { id: input.userId, restaurantId: req.user!.restaurantId },
  });
  if (!user) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Employé introuvable.' });
  }

  const availability = await prisma.employeeAvailability.create({
    data: {
      restaurantId: req.user!.restaurantId,
      userId: input.userId,
      weekday: input.weekday,
      specificDate: input.specificDate,
      reason: input.reason,
    },
    include: AVAILABILITY_INCLUDE,
  });

  res.status(201).json({ availability });
}

export async function deleteEmployeeAvailability(req: Request, res: Response) {
  const existing = await prisma.employeeAvailability.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Règle de disponibilité introuvable.' });
  }

  await prisma.employeeAvailability.delete({ where: { id: existing.id } });
  res.status(204).send();
}
