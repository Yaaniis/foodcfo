import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createPosConnectionSchema, updatePosSaleLineItemSchema } from '../schemas/pos.schemas';

export async function listPosConnections(req: Request, res: Response) {
  const connections = await prisma.posConnection.findMany({
    where: { restaurantId: req.user!.restaurantId },
    orderBy: { connectedAt: 'desc' },
  });
  res.json({ connections });
}

// Une seule connexion active à la fois par restaurant en pratique (voir
// commentaire sur PosConnection dans schema.prisma) : on change de
// caisse, on ne cumule pas. Le Gérant doit explicitement déconnecter
// l'ancienne avant d'en activer une nouvelle, plutôt que de la
// désactiver silencieusement à sa place.
export async function createPosConnection(req: Request, res: Response) {
  const input = createPosConnectionSchema.parse(req.body);

  const existingActive = await prisma.posConnection.findFirst({
    where: { restaurantId: req.user!.restaurantId, isActive: true },
  });
  if (existingActive) {
    return res.status(409).json({
      error: 'CONNECTION_ALREADY_ACTIVE',
      message: 'Une connexion caisse est déjà active. Déconnectez-la avant d\'en activer une nouvelle.',
    });
  }

  const connection = await prisma.posConnection.create({
    data: { restaurantId: req.user!.restaurantId, provider: input.provider },
  });
  res.status(201).json({ connection });
}

// Désactive plutôt que supprime : les ventes déjà remontées via cette
// connexion (PosSale.posConnectionId, onDelete: Restrict) doivent
// rester consultables même après un changement de caisse.
export async function disconnectPosConnection(req: Request, res: Response) {
  const existing = await prisma.posConnection.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Connexion caisse introuvable.' });
  }
  if (!existing.isActive) {
    return res.status(409).json({ error: 'ALREADY_DISCONNECTED', message: 'Cette connexion est déjà déconnectée.' });
  }

  const connection = await prisma.posConnection.update({
    where: { id: existing.id },
    data: { isActive: false, disconnectedAt: new Date() },
  });
  res.json({ connection });
}

// `needsReview` calculé à la volée (pas stocké) : dérivé de l'état des
// lignes, il ne peut jamais désynchroniser d'une valeur en base.
export async function listPosSales(req: Request, res: Response) {
  const sales = await prisma.posSale.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: {
      lineItems: { include: { menuItem: { select: { id: true, name: true } } } },
      posConnection: { select: { id: true, provider: true } },
    },
    orderBy: { soldAt: 'desc' },
  });

  res.json({
    sales: sales.map((sale) => ({
      ...sale,
      needsReview: sale.lineItems.some((line) => !line.menuItemId),
    })),
  });
}

// Rapprochement manuel d'une ligne de vente — même politique que
// updateInvoiceLine (Phase 3) : toujours possible, jamais de champ
// verrouillé, marque explicitement la ligne comme corrigée à la main.
// rawLabel volontairement exclu du schéma de validation : contrairement
// à une facture (OCR pouvant mal lire un libellé), une ligne de vente
// caisse arrive par voie électronique — modifier rawLabel après coup
// falsifierait ce que la caisse a réellement transmis.
export async function updatePosSaleLineItem(req: Request, res: Response) {
  const input = updatePosSaleLineItemSchema.parse(req.body);

  const line = await prisma.posSaleLineItem.findFirst({
    where: { id: req.params.lineItemId, posSale: { id: req.params.saleId, restaurantId: req.user!.restaurantId } },
  });
  if (!line) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Ligne de vente introuvable.' });
  }

  if (input.menuItemId) {
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: input.menuItemId, restaurantId: req.user!.restaurantId },
    });
    if (!menuItem) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Plat introuvable.' });
    }
  }

  const updated = await prisma.posSaleLineItem.update({
    where: { id: line.id },
    data: { ...input, wasManuallyEdited: true },
  });
  res.json({ line: updated });
}
