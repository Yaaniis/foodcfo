import { Router } from 'express';
import { exportInvoicesCsv } from '../controllers/export.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const exportRouter = Router();
exportRouter.use(requireAuth);

// Réservé au Gérant : un export comptable est une fonction de pilotage
// financier, pas une tâche opérationnelle Cuisine/Service (même logique
// que le réglage des seuils de marge, Phase 2).
exportRouter.get('/invoices.csv', requireRole('GERANT'), asyncHandler(exportInvoicesCsv));
