import { Router } from 'express';
import {
  listPosConnections,
  createPosConnection,
  disconnectPosConnection,
  listPosSales,
  updatePosSaleLineItem,
} from '../controllers/pos.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const posRouter = Router();
posRouter.use(requireAuth);

// Gérer la connexion à une caisse est une décision de pilotage
// (comme Équipe/Facturation/Paramètres du restaurant) — réservé au
// Gérant, cohérent avec PosPage.tsx (menu du compte, Gérant uniquement).
posRouter.get('/connections', requireRole('GERANT'), asyncHandler(listPosConnections));
posRouter.post('/connections', requireRole('GERANT'), asyncHandler(createPosConnection));
posRouter.post('/connections/:id/disconnect', requireRole('GERANT'), asyncHandler(disconnectPosConnection));

// Comme les factures et les commandes fournisseurs (décision 0.5) : la
// Cuisine a besoin de voir/rapprocher les ventes (donnée liée aux coûts
// et aux marges), le Service n'en a pas l'usage.
posRouter.get('/sales', requireRole('GERANT', 'CUISINE'), asyncHandler(listPosSales));
posRouter.patch(
  '/sales/:saleId/line-items/:lineItemId',
  requireRole('GERANT', 'CUISINE'),
  asyncHandler(updatePosSaleLineItem),
);
