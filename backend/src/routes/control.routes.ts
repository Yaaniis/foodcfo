import { Router } from 'express';
import multer from 'multer';
import {
  listControlDocuments,
  getControlDocumentFile,
  createControlDocument,
  deleteControlDocument,
  getControlDossier,
} from '../controllers/controlDocument.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Réservé au Gérant, comme Planning : la relation avec les organismes
// de contrôle (dépôt de justificatifs, dossier de conformité) est une
// décision de pilotage administratif, pas un geste opérationnel
// quotidien de l'équipe (contrairement aux checklists d'Hygiène).
export const controlRouter = Router();
controlRouter.use(requireAuth, requireRole('GERANT'));

controlRouter.get('/documents', asyncHandler(listControlDocuments));
controlRouter.get('/documents/:id/file', asyncHandler(getControlDocumentFile));
controlRouter.post('/documents', upload.single('file'), asyncHandler(createControlDocument));
controlRouter.delete('/documents/:id', asyncHandler(deleteControlDocument));

controlRouter.get('/dossier/:organism', asyncHandler(getControlDossier));
