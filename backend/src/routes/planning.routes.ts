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
planningRouter.use(requireAuth);

// Consulter le planning généré (le calendrier des créneaux) est ouvert
// à toute l'équipe — décision explicite de l'utilisateur, 03/08/2026 :
// c'est l'équivalent numérique du planning affiché en cuisine, tout le
// monde doit pouvoir le consulter. Les deux contrôleurs scopent déjà
// par restaurantId (isolation multi-tenant inchangée), la réponse ne
// contient aucune donnée financière/sensible (juste qui travaille
// quand, comme un planning papier classique).
planningRouter.get('/schedules', asyncHandler(listSchedules));
planningRouter.get('/schedules/:id', asyncHandler(getSchedule));

// Tout le reste reste réservé au Gérant : les disponibilités et
// besoins de staffing sont les données d'entrée du générateur (une
// décision de pilotage, pas une consultation), la génération et la
// validation modifient le planning (explicitement exclu par
// l'utilisateur pour Cuisine/Service), et le récapitulatif d'heures
// est un document comptable, pas destiné à l'équipe.
planningRouter.get('/availabilities', requireRole('GERANT'), asyncHandler(listEmployeeAvailabilities));
planningRouter.post('/availabilities', requireRole('GERANT'), asyncHandler(createEmployeeAvailability));
planningRouter.delete('/availabilities/:id', requireRole('GERANT'), asyncHandler(deleteEmployeeAvailability));

planningRouter.get('/staffing-requirements', requireRole('GERANT'), asyncHandler(listStaffingRequirements));
planningRouter.post('/staffing-requirements', requireRole('GERANT'), asyncHandler(createStaffingRequirement));
planningRouter.delete(
  '/staffing-requirements/:id',
  requireRole('GERANT'),
  asyncHandler(deleteStaffingRequirement),
);

planningRouter.post('/schedules/generate', requireRole('GERANT'), asyncHandler(generateScheduleForRestaurant));
planningRouter.post('/schedules/:id/validate', requireRole('GERANT'), asyncHandler(validateSchedule));

planningRouter.get('/hours-summary.csv', requireRole('GERANT'), asyncHandler(exportHoursSummaryCsv));
