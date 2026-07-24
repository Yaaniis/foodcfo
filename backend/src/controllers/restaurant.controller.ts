// Endpoint public (pas de requireAuth) : c'est le point d'entrée pour un
// NOUVEAU restaurant qui n'a encore ni compte ni données. Crée le
// restaurant et son premier utilisateur (toujours GERANT) en une seule
// opération, puis connecte directement la personne (mêmes tokens qu'un
// login classique) pour éviter une double étape signup → login.
//
// Pertinent pour la vision multi-tenant du produit (décision 0.1) :
// c'est ce endpoint qui permettra plus tard de vendre l'outil à
// d'autres restaurateurs sans changement de code.

import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { hashPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, hashToken, expiryDateFromDuration } from '../utils/tokens';
import { bootstrapRestaurantSchema, updateThresholdsSchema } from '../schemas/restaurant.schemas';
import { env } from '../config/env';

export async function bootstrap(req: Request, res: Response) {
  const { restaurantName, currency, timezone, gerant } = bootstrapRestaurantSchema.parse(req.body);

  // À ce stade (mono-restaurant visible), on vérifie l'unicité de l'email
  // tous restaurants confondus par simplicité — cohérent avec la
  // recherche par email seul utilisée au login (voir auth.controller.ts).
  const existing = await prisma.user.findFirst({ where: { email: gerant.email } });
  if (existing) {
    return res.status(409).json({ error: 'EMAIL_TAKEN', message: 'Cette adresse email est déjà utilisée.' });
  }

  const passwordHash = await hashPassword(gerant.password);

  const restaurant = await prisma.restaurant.create({
    data: {
      name: restaurantName,
      currency,
      timezone,
      users: {
        create: {
          email: gerant.email,
          passwordHash,
          role: 'GERANT',
          firstName: gerant.firstName,
          lastName: gerant.lastName,
        },
      },
    },
    include: { users: true },
  });

  const user = restaurant.users[0];

  const accessToken = signAccessToken({ sub: user.id, restaurantId: restaurant.id, role: user.role });
  const refreshToken = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: expiryDateFromDuration(env.JWT_REFRESH_EXPIRES_IN),
    },
  });

  logger.info({ restaurantId: restaurant.id, userId: user.id }, 'Nouveau restaurant créé');

  return res.status(201).json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      restaurantId: restaurant.id,
    },
  });
}

// Renvoie les réglages du restaurant courant (pour l'instant, uniquement
// les seuils de marge — décision 0.6). Ouvert aux 3 rôles en lecture :
// le tableau de bord affiche les seuils même en lecture seule.
export async function getMyRestaurant(req: Request, res: Response) {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: req.user!.restaurantId },
    select: {
      id: true,
      name: true,
      marginGreenThreshold: true,
      marginOrangeThreshold: true,
      priceIncreaseAlertThreshold: true,
    },
  });
  res.json({ restaurant });
}

// Modification réservée au Gérant (voir restaurant.routes.ts) : changer
// les seuils d'alerte est une décision de pilotage financier, pas une
// tâche opérationnelle Cuisine/Service.
export async function updateThresholds(req: Request, res: Response) {
  const input = updateThresholdsSchema.parse(req.body);

  const restaurant = await prisma.restaurant.update({
    where: { id: req.user!.restaurantId },
    data: {
      marginGreenThreshold: input.marginGreenThreshold,
      marginOrangeThreshold: input.marginOrangeThreshold,
    },
    select: {
      id: true,
      name: true,
      marginGreenThreshold: true,
      marginOrangeThreshold: true,
      priceIncreaseAlertThreshold: true,
    },
  });

  res.json({ restaurant });
}
