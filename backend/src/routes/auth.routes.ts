import { Router } from 'express';
import { login, refresh, logout } from '../controllers/auth.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { loginRateLimiter } from '../middleware/rateLimit';

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, asyncHandler(login));
authRouter.post('/refresh', asyncHandler(refresh));
authRouter.post('/logout', asyncHandler(logout));
