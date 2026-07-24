import { Router } from 'express';
import { createWasteEntry, listWasteEntries, getWasteStats } from '../controllers/waste.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const wasteRouter = Router();
wasteRouter.use(requireAuth);

// Décision 0.5 : la Cuisine déclare le gaspillage, le Service n'en a
// pas l'usage.
wasteRouter.use(requireRole('GERANT', 'CUISINE'));

wasteRouter.get('/', asyncHandler(listWasteEntries));
wasteRouter.get('/stats', asyncHandler(getWasteStats));
wasteRouter.post('/', asyncHandler(createWasteEntry));
