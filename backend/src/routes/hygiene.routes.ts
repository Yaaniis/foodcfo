import { Router } from 'express';
import multer from 'multer';
import {
  listHygieneReferenceItems,
  getHygieneReferenceItemMedia,
  createHygieneReferenceItem,
  updateHygieneReferenceItem,
  deleteHygieneReferenceItem,
} from '../controllers/hygieneReferenceItem.controller';
import {
  listCleaningChecklistTemplates,
  createCleaningChecklistTemplate,
  deleteCleaningChecklistTemplate,
  listCleaningChecklistCompletions,
  getCleaningChecklistCompletion,
  createCleaningChecklistCompletion,
  toggleCleaningChecklistCompletionItem,
} from '../controllers/cleaningChecklist.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

// Stockage en mémoire, comme invoice.routes.ts : on vérifie le type
// réel du fichier (magic bytes) avant de décider quoi en faire.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const hygieneRouter = Router();
hygieneRouter.use(requireAuth);

// Rôles volontairement différenciés par sous-ressource (contrairement
// au module Planning, entièrement Gérant) : le contenu de référence et
// les modèles de checklist sont une décision de pilotage (Gérant
// uniquement, "contenu fourni par le restaurateur" — décision 7.0),
// mais remplir une checklist de fin de service est un geste opérationnel
// quotidien de toute l'équipe, comme la déclaration de gaspillage.

hygieneRouter.get('/reference-items', asyncHandler(listHygieneReferenceItems));
hygieneRouter.get('/reference-items/:id/media', asyncHandler(getHygieneReferenceItemMedia));
hygieneRouter.post(
  '/reference-items',
  requireRole('GERANT'),
  upload.single('media'),
  asyncHandler(createHygieneReferenceItem),
);
hygieneRouter.patch(
  '/reference-items/:id',
  requireRole('GERANT'),
  upload.single('media'),
  asyncHandler(updateHygieneReferenceItem),
);
hygieneRouter.delete('/reference-items/:id', requireRole('GERANT'), asyncHandler(deleteHygieneReferenceItem));

hygieneRouter.get('/checklist-templates', asyncHandler(listCleaningChecklistTemplates));
hygieneRouter.post('/checklist-templates', requireRole('GERANT'), asyncHandler(createCleaningChecklistTemplate));
hygieneRouter.delete('/checklist-templates/:id', requireRole('GERANT'), asyncHandler(deleteCleaningChecklistTemplate));

hygieneRouter.get('/checklist-completions', asyncHandler(listCleaningChecklistCompletions));
hygieneRouter.get('/checklist-completions/:id', asyncHandler(getCleaningChecklistCompletion));
hygieneRouter.post('/checklist-completions', asyncHandler(createCleaningChecklistCompletion));
hygieneRouter.patch(
  '/checklist-completions/:completionId/items/:itemId',
  asyncHandler(toggleCleaningChecklistCompletionItem),
);
