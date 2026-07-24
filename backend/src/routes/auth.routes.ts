import { Router } from 'express';
import { login, refresh, logout } from '../controllers/auth.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const authRouter = Router();

authRouter.post('/login', asyncHandler(login));
authRouter.post('/refresh', asyncHandler(refresh));
authRouter.post('/logout', asyncHandler(logout));
