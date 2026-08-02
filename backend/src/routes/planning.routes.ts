import { Router } from 'express';
import {
  listEmployeeAvailabilities,
  createEmployeeAvailability,
  deleteEmployeeAvailability,
} from '../controllers/availability.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const planningRouter = Router();

// Gérer le planning (disponibilités, besoins, génération) est une
// décision de pilotage de l'équipe — réservé au Gérant, comme la
// gestion d'équipe (userRouter) dont ce module dépend directement
// (les employés planifiés sont les mêmes que ceux de /api/users).
planningRouter.use(requireAuth, requireRole('GERANT'));

planningRouter.get('/availabilities', asyncHandler(listEmployeeAvailabilities));
planningRouter.post('/availabilities', asyncHandler(createEmployeeAvailability));
planningRouter.delete('/availabilities/:id', asyncHandler(deleteEmployeeAvailability));
