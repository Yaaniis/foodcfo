import { Router } from 'express';
import { listAlerts, updateAlertStatus } from '../controllers/alert.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const alertRouter = Router();
alertRouter.use(requireAuth);

// Décision 0.5 : la marge est une donnée de pilotage financier interne,
// masquée au Service comme sur /api/dashboard et /api/menu-items.
alertRouter.use(requireRole('GERANT', 'CUISINE'));

alertRouter.get('/', asyncHandler(listAlerts));
alertRouter.patch('/:id', asyncHandler(updateAlertStatus));
