import { Router } from 'express';
import {
  listOrders,
  getOrder,
  getOrderSuggestions,
  createOrdersFromCart,
  updateOrderLines,
  sendOrder,
  updateOrderStatus,
} from '../controllers/order.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const orderRouter = Router();
orderRouter.use(requireAuth);

// Comme les factures (décision 0.5) : la Cuisine gère les commandes
// fournisseurs, le Service n'en a pas l'usage.
orderRouter.use(requireRole('GERANT', 'CUISINE'));

orderRouter.get('/', asyncHandler(listOrders));
orderRouter.get('/suggestions', asyncHandler(getOrderSuggestions));
orderRouter.post('/from-cart', asyncHandler(createOrdersFromCart));
orderRouter.get('/:id', asyncHandler(getOrder));
orderRouter.patch('/:id/lines', asyncHandler(updateOrderLines));
orderRouter.post('/:id/send', asyncHandler(sendOrder));
orderRouter.patch('/:id/status', asyncHandler(updateOrderStatus));
