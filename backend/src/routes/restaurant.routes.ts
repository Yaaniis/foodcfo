import { Router } from 'express';
import { bootstrap } from '../controllers/restaurant.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const restaurantRouter = Router();

// Public volontairement : c'est le tout premier point d'entrée d'un
// nouveau restaurant, avant qu'aucun compte n'existe.
restaurantRouter.post('/bootstrap', asyncHandler(bootstrap));
