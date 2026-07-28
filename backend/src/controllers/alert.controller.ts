import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { updateAlertStatusSchema } from '../schemas/alert.schemas';

const ALERT_INCLUDE = {
  menuItem: { select: { id: true, name: true } },
} as const;

// Toutes les alertes (actives et traitées) sont renvoyées en une seule
// liste, la plus récente d'abord — le frontend les répartit en
// "actives" / "historique" plutôt que d'exposer un filtre côté API dès
// cette première version, pour rester simple.
export async function listAlerts(req: Request, res: Response) {
  const alerts = await prisma.marginAlert.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: ALERT_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ alerts });
}

export async function updateAlertStatus(req: Request, res: Response) {
  const { status } = updateAlertStatusSchema.parse(req.body);

  const existing = await prisma.marginAlert.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Alerte introuvable.' });
  }
  // Seule une alerte active peut être résolue/ignorée — évite qu'une
  // action utilisateur écrase la valeur/le message d'une alerte déjà
  // close, ou réactive par erreur une alerte que le recalcul
  // automatique (lib/marginAlerts.ts) a depuis remise à jour.
  if (existing.status !== 'ACTIVE') {
    return res.status(409).json({ error: 'ALREADY_HANDLED', message: 'Cette alerte a déjà été traitée.' });
  }

  const alert = await prisma.marginAlert.update({
    where: { id: existing.id },
    data: { status, resolvedAt: new Date() },
    include: ALERT_INCLUDE,
  });
  res.json({ alert });
}
