// Logique des 3 endpoints d'authentification. Règles appliquées :
// - le mot de passe n'est jamais comparé en clair (argon2.verify)
// - le refresh token est stocké en base sous forme de hash, jamais en
//   clair, et révocable individuellement (table RefreshToken)
// - rotation du refresh token à chaque utilisation : l'ancien est
//   immédiatement révoqué et un nouveau est émis, pour limiter les
//   dégâts si un refresh token venait à fuiter

import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { verifyPassword } from '../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  expiryDateFromDuration,
} from '../utils/tokens';
import { loginSchema, refreshSchema } from '../schemas/auth.schemas';
import { env } from '../config/env';

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  // NOTE (décision 0.1 — multi-tenant "invisible") : tant qu'un seul
  // restaurant existe réellement, on cherche l'utilisateur par email
  // seul. Le schéma garantit l'unicité de l'email par restaurant (pas
  // globalement) — si plusieurs restaurants coexistent un jour avec des
  // emails en doublon entre eux, cette recherche devra être précisée
  // (ex : sous-domaine ou sélecteur de restaurant à la connexion).
  const user = await prisma.user.findFirst({ where: { email, isActive: true } });

  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect.' });
  }

  const accessToken = signAccessToken({ sub: user.id, restaurantId: user.restaurantId, role: user.role });
  const refreshToken = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: expiryDateFromDuration(env.JWT_REFRESH_EXPIRES_IN),
    },
  });

  logger.info({ userId: user.id }, 'Connexion réussie');

  return res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      restaurantId: user.restaurantId,
    },
  });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalide ou expiré.' });
  }

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalide ou expiré.' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Utilisateur introuvable ou désactivé.' });
  }

  // Rotation : l'ancien refresh token est révoqué immédiatement, un
  // nouveau est émis. Si quelqu'un rejoue un vieux refresh token révoqué,
  // ça signale une possible fuite (à surveiller en Phase 6 - observabilité).
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const newAccessToken = signAccessToken({ sub: user.id, restaurantId: user.restaurantId, role: user.role });
  const newRefreshToken = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: expiryDateFromDuration(env.JWT_REFRESH_EXPIRES_IN),
    },
  });

  return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);

  // On révoque sans lever d'erreur si le token n'existe pas déjà plus —
  // se déconnecter doit toujours réussir du point de vue de l'utilisateur.
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return res.status(204).send();
}
