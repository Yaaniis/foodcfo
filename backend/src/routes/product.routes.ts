import { Router } from 'express';
import { listProducts, createProduct } from '../controllers/product.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const productRouter = Router();
productRouter.use(requireAuth);

productRouter.get('/', asyncHandler(listProducts));
productRouter.post('/', requireRole('GERANT', 'CUISINE'), asyncHandler(createProduct));
