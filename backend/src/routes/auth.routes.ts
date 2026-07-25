import { Router } from 'express';
import { login, refresh, logout, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { loginRateLimiter, forgotPasswordRateLimiter, resetPasswordRateLimiter } from '../middleware/rateLimit';

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, asyncHandler(login));
authRouter.post('/refresh', asyncHandler(refresh));
authRouter.post('/logout', asyncHandler(logout));
authRouter.post('/forgot-password', forgotPasswordRateLimiter, asyncHandler(forgotPassword));
authRouter.post('/reset-password', resetPasswordRateLimiter, asyncHandler(resetPassword));
