import { Router } from 'express';
import { listUsers, createUser, updateUser } from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../utils/asyncHandler';

export const userRouter = Router();

// Toutes les routes de ce fichier exigent d'être connecté ET d'être Gérant.
userRouter.use(requireAuth, requireRole('GERANT'));

userRouter.get('/', asyncHandler(listUsers));
userRouter.post('/', asyncHandler(createUser));
userRouter.patch('/:id', asyncHandler(updateUser));
