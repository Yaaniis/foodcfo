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
import { deleteRestaurantSchema } from '../schemas/dataPrivacy.schemas';
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

// RGPD : export complet des données du restaurant "sur demande" (droit
// à la portabilité). Un seul gros JSON plutôt que plusieurs exports
// spécialisés (le CSV comptable de la Phase 6 reste utile séparément
// pour la compta, celui-ci est exhaustif). Jamais de mot de passe ni de
// hash de refresh token dans l'export, même pour le propriétaire des
// données lui-même — un `select` explicite sur User plutôt que
// d'inclure la relation brute.
export async function exportRestaurantData(req: Request, res: Response) {
  const restaurantId = req.user!.restaurantId;

  const [restaurant, users, suppliers, products, menuItems, invoices, orders, wasteEntries, marginAlerts] =
    await Promise.all([
      prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
      prisma.user.findMany({
        where: { restaurantId },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
      }),
      prisma.supplier.findMany({ where: { restaurantId } }),
      prisma.product.findMany({ where: { restaurantId }, include: { priceHistory: true } }),
      prisma.menuItem.findMany({
        where: { restaurantId },
        include: { recipe: { include: { ingredients: true } } },
      }),
      prisma.invoice.findMany({ where: { restaurantId }, include: { lineItems: true } }),
      prisma.order.findMany({ where: { restaurantId }, include: { lineItems: true } }),
      prisma.wasteEntry.findMany({ where: { restaurantId } }),
      prisma.marginAlert.findMany({ where: { restaurantId } }),
    ]);

  logger.info({ restaurantId, userId: req.user!.id }, 'Export RGPD des données du restaurant demandé');

  res.setHeader('Content-Disposition', `attachment; filename="foodcfo-export-${restaurantId}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    restaurant,
    users,
    suppliers,
    products,
    menuItems,
    invoices,
    orders,
    wasteEntries,
    marginAlerts,
  });
}

// RGPD : suppression "sur demande" (droit à l'effacement) — irréversible.
// L'ordre de suppression est explicite et déterministe plutôt que de se
// fier à la seule cascade de `restaurant.delete()` : plusieurs relations
// du schéma sont volontairement en onDelete: Restrict (RecipeIngredient
// et OrderLineItem vers Product, WasteEntry.declaredBy vers User) pour
// ne jamais perdre silencieusement une référence historique — il faut
// donc vider ces tables en premier, dans le bon ordre, avant que la
// cascade sur Restaurant puisse atteindre Product/Supplier/User.
export async function deleteRestaurant(req: Request, res: Response) {
  const { confirmRestaurantName } = deleteRestaurantSchema.parse(req.body);
  const restaurantId = req.user!.restaurantId;

  const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  if (confirmRestaurantName !== restaurant.name) {
    return res.status(400).json({
      error: 'CONFIRMATION_MISMATCH',
      message: 'Le nom saisi ne correspond pas au nom exact du restaurant.',
    });
  }

  await prisma.$transaction([
    prisma.order.deleteMany({ where: { restaurantId } }), // cascade → OrderLineItem
    prisma.menuItem.deleteMany({ where: { restaurantId } }), // cascade → Recipe → RecipeIngredient
    prisma.wasteEntry.deleteMany({ where: { restaurantId } }),
    prisma.marginAlert.deleteMany({ where: { restaurantId } }),
    prisma.invoice.deleteMany({ where: { restaurantId } }), // cascade → InvoiceLineItem
    prisma.product.deleteMany({ where: { restaurantId } }), // cascade → PriceHistory ; sûr maintenant que RecipeIngredient/OrderLineItem sont vides
    prisma.supplier.deleteMany({ where: { restaurantId } }), // sûr maintenant que Product/Order sont vides
    prisma.user.deleteMany({ where: { restaurantId } }), // cascade → RefreshToken ; sûr maintenant que WasteEntry est vide
    prisma.restaurant.delete({ where: { id: restaurantId } }),
  ]);

  logger.info({ restaurantId, userId: req.user!.id }, 'Restaurant supprimé sur demande RGPD');
  res.status(204).send();
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
