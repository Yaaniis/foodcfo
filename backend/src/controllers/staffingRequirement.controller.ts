import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createStaffingRequirementSchema } from '../schemas/staffingRequirement.schemas';
import { parseTimeString, formatTimeToString } from '../lib/time';

function serializeStaffingRequirement(req: { id: string; weekday: string; role: string; startTime: Date; endTime: Date; requiredCount: number }) {
  return {
    id: req.id,
    weekday: req.weekday,
    role: req.role,
    startTime: formatTimeToString(req.startTime),
    endTime: formatTimeToString(req.endTime),
    requiredCount: req.requiredCount,
  };
}

export async function listStaffingRequirements(req: Request, res: Response) {
  const requirements = await prisma.staffingRequirement.findMany({
    where: { restaurantId: req.user!.restaurantId },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });
  res.json({ staffingRequirements: requirements.map(serializeStaffingRequirement) });
}

export async function createStaffingRequirement(req: Request, res: Response) {
  const input = createStaffingRequirementSchema.parse(req.body);

  const requirement = await prisma.staffingRequirement.create({
    data: {
      restaurantId: req.user!.restaurantId,
      weekday: input.weekday,
      role: input.role,
      startTime: parseTimeString(input.startTime),
      endTime: parseTimeString(input.endTime),
      requiredCount: input.requiredCount,
    },
  });

  res.status(201).json({ staffingRequirement: serializeStaffingRequirement(requirement) });
}

export async function deleteStaffingRequirement(req: Request, res: Response) {
  const existing = await prisma.staffingRequirement.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Besoin de staffing introuvable.' });
  }

  await prisma.staffingRequirement.delete({ where: { id: existing.id } });
  res.status(204).send();
}
