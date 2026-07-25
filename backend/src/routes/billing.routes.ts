import { Router } from 'express';
import { getBillingStatus, createCheckoutSession, createPortalSession } from '../controllers/billing.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const billingRouter = Router();

billingRouter.get('/status', requireAuth, asyncHandler(getBillingStatus));
billingRouter.post('/checkout', requireAuth, requireRole('GERANT'), asyncHandler(createCheckoutSession));
billingRouter.post('/portal', requireAuth, requireRole('GERANT'), asyncHandler(createPortalSession));
