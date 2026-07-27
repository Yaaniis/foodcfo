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
import { verifyPassword, hashPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, expiryDateFromDuration } from '../utils/tokens';
import {
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../schemas/auth.schemas';
import { env } from '../config/env';
import { sendEmail, EmailError } from '../lib/email';
import { createPasswordResetToken } from '../lib/passwordReset';

export async function login(req: Request, res: Response) {
  const { email, password, restaurantId } = loginSchema.parse(req.body);

  // Compte multi-restaurant (voir POST /api/restaurants/add) : la même
  // personne peut avoir une ligne User par restaurant, avec le même
  // email et le même hash de mot de passe (copié à la création du
  // deuxième restaurant, jamais re-saisi). Le schéma garantit
  // l'unicité de l'email par restaurant, pas globalement — on doit
  // donc vérifier le mot de passe contre chaque ligne correspondant à
  // cet email, pas juste prendre la première trouvée.
  const candidates = await prisma.user.findMany({ where: { email, isActive: true } });
  const matches = [];
  for (const candidate of candidates) {
    if (await verifyPassword(candidate.passwordHash, password)) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect.' });
  }

  let user = matches[0];
  if (matches.length > 1) {
    if (restaurantId) {
      const chosen = matches.find((m) => m.restaurantId === restaurantId);
      if (!chosen) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect.' });
      }
      user = chosen;
    } else {
      // Pas de restaurant précisé : on ne devine jamais lequel choisir,
      // on renvoie la liste pour que le frontend affiche un sélecteur
      // (voir la note d'origine sur décision 0.1, désormais implémentée).
      const restaurants = await prisma.restaurant.findMany({
        where: { id: { in: matches.map((m) => m.restaurantId) } },
        select: { id: true, name: true },
      });
      return res.json({
        requiresRestaurantSelection: true,
        restaurants: matches.map((m) => ({
          restaurantId: m.restaurantId,
          restaurantName: restaurants.find((r) => r.id === m.restaurantId)?.name ?? '',
          role: m.role,
        })),
      });
    }
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

const GENERIC_FORGOT_PASSWORD_MESSAGE = 'Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.';

// Réponse strictement identique que l'email existe ou non (délai réseau
// mis à part) : révéler la différence permettrait à quiconque de
// vérifier quelles adresses ont un compte sur FoodCFO.
export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);

  const users = await prisma.user.findMany({ where: { email } });

  if (users.length > 0) {
    const rawToken = await createPasswordResetToken(email);
    const resetUrl = `${env.FRONTEND_URL ?? 'http://localhost:5173'}/reset-password?token=${rawToken}`;
    try {
      await sendEmail(
        email,
        'Réinitialisation de votre mot de passe FoodCFO',
        `Bonjour,\n\nUne demande de réinitialisation de mot de passe a été faite pour ce compte FoodCFO.\n\nPour choisir un nouveau mot de passe, cliquez sur ce lien (valable 1 heure) :\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe actuel reste inchangé.`,
      );
    } catch (err) {
      // Ne remonte jamais au client : même situation que l'envoi de
      // commande/rapport, la clé Resend peut être un placeholder en
      // environnement de démo — le token reste créé en base, seul son
      // acheminement par email échoue.
      const message = err instanceof EmailError ? err.message : "Échec inattendu de l'envoi de l'email.";
      logger.warn({ email, err: message }, 'Échec de l’envoi de l’email de réinitialisation');
    }
  }

  return res.json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = resetPasswordSchema.parse(req.body);

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: 'INVALID_RESET_TOKEN', message: 'Lien de réinitialisation invalide ou expiré.' });
  }

  const passwordHash = await hashPassword(newPassword);

  // Un compte multi-restaurant a une ligne User par restaurant partageant
  // le même mot de passe (voir addRestaurant) — les mettre toutes à jour,
  // pas seulement la première trouvée, sous peine de désynchronisation.
  const users = await prisma.user.findMany({ where: { email: resetToken.email } });

  await prisma.$transaction([
    prisma.user.updateMany({ where: { email: resetToken.email }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: { in: users.map((u) => u.id) }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  logger.info({ email: resetToken.email }, 'Mot de passe réinitialisé');

  return res.status(204).send();
}

// Changement de mot de passe pour un utilisateur déjà connecté (menu
// "Mon compte"), distinct de resetPassword (flux "mot de passe
// oublié", sans être connecté). Révoque toutes les sessions existantes
// comme resetPassword — y compris celle en cours : l'access token
// reste valide jusqu'à expiration (15 min), mais tout refresh échouera,
// forçant une reconnexion avec le nouveau mot de passe.
export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

  const isValid = await verifyPassword(currentUser.passwordHash, currentPassword);
  if (!isValid) {
    // 400, pas 401 : cette route est déjà authentifiée (requireAuth) —
    // un 401 ici serait interprété par authFetch comme "session
    // expirée" et déclencherait une déconnexion automatique côté
    // client au lieu d'afficher l'erreur dans le formulaire (constaté
    // en testant dans le navigateur avant ce correctif).
    return res.status(400).json({ error: 'INVALID_CURRENT_PASSWORD', message: 'Mot de passe actuel incorrect.' });
  }

  const passwordHash = await hashPassword(newPassword);

  // Même principe que resetPassword : toutes les lignes User partageant
  // cet email ET ce hash actuel (compte multi-restaurant réellement lié,
  // voir addRestaurant) doivent rester synchronisées. Le filtre sur
  // passwordHash (pas seulement l'email) est essentiel ici, à la
  // différence de resetPassword : createUser ne vérifie l'unicité de
  // l'email que par restaurant, donc un compte totalement étranger
  // pourrait partager cet email sans être lié. Sans ce filtre,
  // n'importe qui authentifié sur SON PROPRE compte (avec SON propre
  // mot de passe, donc `isValid` toujours vrai) écraserait aussi le mot
  // de passe de tous les autres comptes partageant son email — y
  // compris un compte tiers sans aucun rapport, avec un mot de passe de
  // son choix. resetPassword, lui, reste sûr sans ce filtre : le token
  // est envoyé par email, donc seul le vrai propriétaire de la boîte de
  // réception peut jamais l'obtenir.
  const users = await prisma.user.findMany({ where: { email: currentUser.email, passwordHash: currentUser.passwordHash } });

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { email: currentUser.email, passwordHash: currentUser.passwordHash },
      data: { passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: { in: users.map((u) => u.id) }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ userId: currentUser.id }, 'Mot de passe changé par l’utilisateur');

  return res.status(204).send();
}
