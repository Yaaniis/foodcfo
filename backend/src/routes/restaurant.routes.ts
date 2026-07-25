import { Router } from 'express';
import {
  bootstrap,
  getMyRestaurant,
  updateThresholds,
  exportRestaurantData,
  deleteRestaurant,
} from '../controllers/restaurant.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const restaurantRouter = Router();

// Public volontairement : c'est le tout premier point d'entrée d'un
// nouveau restaurant, avant qu'aucun compte n'existe.
restaurantRouter.post('/bootstrap', asyncHandler(bootstrap));

restaurantRouter.get('/me', requireAuth, asyncHandler(getMyRestaurant));
restaurantRouter.patch('/me/thresholds', requireAuth, requireRole('GERANT'), asyncHandler(updateThresholds));

// RGPD (exigence transversale du plan) : export et suppression sur
// demande, réservés au Gérant.
restaurantRouter.get('/me/export', requireAuth, requireRole('GERANT'), asyncHandler(exportRestaurantData));
restaurantRouter.delete('/me', requireAuth, requireRole('GERANT'), asyncHandler(deleteRestaurant));
