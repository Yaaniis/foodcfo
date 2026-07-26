import { Router } from 'express';
import { login, refresh, logout, forgotPassword, resetPassword, changePassword } from '../controllers/auth.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import {
  loginRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
  changePasswordRateLimiter,
} from '../middleware/rateLimit';

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, asyncHandler(login));
authRouter.post('/refresh', asyncHandler(refresh));
authRouter.post('/logout', asyncHandler(logout));
authRouter.post('/forgot-password', forgotPasswordRateLimiter, asyncHandler(forgotPassword));
authRouter.post('/reset-password', resetPasswordRateLimiter, asyncHandler(resetPassword));
authRouter.patch('/password', requireAuth, changePasswordRateLimiter, asyncHandler(changePassword));
