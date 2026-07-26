import { Router } from 'express';
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../controllers/supplier.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const supplierRouter = Router();
supplierRouter.use(requireAuth);

// Lecture ouverte aux 3 rôles (utile pour la Phase 4 - commandes -
// où même le personnel de service peut avoir besoin de consulter).
supplierRouter.get('/', asyncHandler(listSuppliers));
supplierRouter.post('/', requireRole('GERANT', 'CUISINE'), asyncHandler(createSupplier));
supplierRouter.patch('/:id', requireRole('GERANT', 'CUISINE'), asyncHandler(updateSupplier));
supplierRouter.delete('/:id', requireRole('GERANT'), asyncHandler(deleteSupplier));
