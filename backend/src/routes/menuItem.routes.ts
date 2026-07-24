import { Router } from 'express';
import {
  listMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from '../controllers/menuItem.controller';
import { upsertRecipe } from '../controllers/recipe.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const menuItemRouter = Router();
menuItemRouter.use(requireAuth);

// Lecture ouverte aux 3 rôles (le Service a besoin de voir la carte et
// les allergènes). Écriture réservée à Gérant/Cuisine (décision 0.5 :
// la Cuisine gère les fiches techniques). Suppression réservée au
// Gérant seul, plus sensible qu'une simple désactivation.
menuItemRouter.get('/', asyncHandler(listMenuItems));
menuItemRouter.get('/:id', asyncHandler(getMenuItem));
menuItemRouter.post('/', requireRole('GERANT', 'CUISINE'), asyncHandler(createMenuItem));
menuItemRouter.patch('/:id', requireRole('GERANT', 'CUISINE'), asyncHandler(updateMenuItem));
menuItemRouter.delete('/:id', requireRole('GERANT'), asyncHandler(deleteMenuItem));

menuItemRouter.put('/:menuItemId/recipe', requireRole('GERANT', 'CUISINE'), asyncHandler(upsertRecipe));
