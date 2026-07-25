import { Router } from 'express';
import { getMonthlyReportPreview, sendMonthlyReport } from '../controllers/report.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const reportRouter = Router();
reportRouter.use(requireAuth);
reportRouter.use(requireRole('GERANT'));

reportRouter.get('/monthly/preview', asyncHandler(getMonthlyReportPreview));
reportRouter.post('/monthly/send', asyncHandler(sendMonthlyReport));
