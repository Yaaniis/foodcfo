import { Router } from 'express';
import { getDashboard } from '../controllers/dashboard.controller';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

// Lecture ouverte aux 3 rôles, comme la carte (le Service peut avoir
// besoin de voir la santé des marges sans pouvoir la modifier).
dashboardRouter.get('/', asyncHandler(getDashboard));
