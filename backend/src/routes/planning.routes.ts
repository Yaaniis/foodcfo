import { Router } from 'express';
import {
  listEmployeeAvailabilities,
  createEmployeeAvailability,
  deleteEmployeeAvailability,
} from '../controllers/availability.controller';
import {
  listStaffingRequirements,
  createStaffingRequirement,
  deleteStaffingRequirement,
} from '../controllers/staffingRequirement.controller';
import {
  listSchedules,
  getSchedule,
  generateScheduleForRestaurant,
  validateSchedule,
} from '../controllers/schedule.controller';
import { exportHoursSummaryCsv } from '../controllers/hoursSummary.controller';
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

planningRouter.get('/staffing-requirements', asyncHandler(listStaffingRequirements));
planningRouter.post('/staffing-requirements', asyncHandler(createStaffingRequirement));
planningRouter.delete('/staffing-requirements/:id', asyncHandler(deleteStaffingRequirement));

planningRouter.get('/schedules', asyncHandler(listSchedules));
planningRouter.get('/schedules/:id', asyncHandler(getSchedule));
planningRouter.post('/schedules/generate', asyncHandler(generateScheduleForRestaurant));
planningRouter.post('/schedules/:id/validate', asyncHandler(validateSchedule));

planningRouter.get('/hours-summary.csv', asyncHandler(exportHoursSummaryCsv));
