import { Router } from 'express';
import multer from 'multer';
import {
  listInvoices,
  getInvoice,
  getInvoiceFile,
  uploadInvoice,
  patchInvoice,
  addInvoiceLine,
  updateInvoiceLine,
  deleteInvoiceLine,
  validateInvoice,
} from '../controllers/invoice.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';
import { invoiceUploadRateLimiter } from '../middleware/rateLimit';

// Stockage en mémoire (pas sur disque via multer) : on veut d'abord
// vérifier le type réel du fichier (magic bytes, voir lib/fileType.ts)
// avant de décider où et comment l'écrire — multer.diskStorage écrirait
// le fichier avant cette vérification.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);

// Décision 0.5 : la Cuisine gère les factures, le Service n'en a pas
// l'usage (ni en lecture ni en écriture — données de coût sensibles).
invoiceRouter.use(requireRole('GERANT', 'CUISINE'));

invoiceRouter.get('/', asyncHandler(listInvoices));
invoiceRouter.post('/', invoiceUploadRateLimiter, upload.single('file'), asyncHandler(uploadInvoice));
invoiceRouter.get('/:id', asyncHandler(getInvoice));
invoiceRouter.get('/:id/file', asyncHandler(getInvoiceFile));
invoiceRouter.patch('/:id', asyncHandler(patchInvoice));
invoiceRouter.post('/:id/validate', asyncHandler(validateInvoice));
invoiceRouter.post('/:id/lines', asyncHandler(addInvoiceLine));
invoiceRouter.patch('/:id/lines/:lineId', asyncHandler(updateInvoiceLine));
invoiceRouter.delete('/:id/lines/:lineId', asyncHandler(deleteInvoiceLine));
