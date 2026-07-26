import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Adresse email invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
  // Renseigné à la deuxième étape de connexion uniquement, quand le
  // même email/mot de passe donne accès à plusieurs restaurants (compte
  // multi-établissement, voir auth.controller.ts) — précise auquel se
  // connecter. Absent ou ignoré pour un compte à un seul restaurant.
  restaurantId: z.string().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Adresse email invalide.'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token requis.'),
  newPassword: z.string().min(8, '8 caractères minimum.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis.'),
  newPassword: z.string().min(8, '8 caractères minimum.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
