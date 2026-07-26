import { Router } from 'express';
import { listProducts, createProduct, updateProduct, deleteProduct } from '../controllers/product.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const productRouter = Router();
productRouter.use(requireAuth);

productRouter.get('/', asyncHandler(listProducts));
productRouter.post('/', requireRole('GERANT', 'CUISINE'), asyncHandler(createProduct));
productRouter.patch('/:id', requireRole('GERANT', 'CUISINE'), asyncHandler(updateProduct));
productRouter.delete('/:id', requireRole('GERANT'), asyncHandler(deleteProduct));
