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
import {
  bootstrapRestaurantSchema,
  updateThresholdsSchema,
  updateRestaurantSchema,
  addRestaurantSchema,
  switchRestaurantSchema,
} from '../schemas/restaurant.schemas';
import { deleteRestaurantSchema } from '../schemas/dataPrivacy.schemas';
import { env } from '../config/env';
import { gatherDashboardData } from './dashboard.controller';
import { stripe, isBillingConfigured } from '../lib/stripe';
import { needsStripeCancellation } from './billing.controller';

export async function bootstrap(req: Request, res: Response) {
  const { restaurantName, currency, timezone, gerant } = bootstrapRestaurantSchema.parse(req.body);
  // acceptTerms est déjà validé par le schéma (littéral `true` requis) —
  // on ne le déstructure pas, juste besoin de l'horodatage ici.

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
          termsAcceptedAt: new Date(),
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
      timezone: true,
      marginGreenThreshold: true,
      marginOrangeThreshold: true,
      priceIncreaseAlertThreshold: true,
    },
  });
  res.json({ restaurant });
}

// Nom et fuseau horaire uniquement — pas `currency`, un champ présent
// au schéma mais jamais lu nulle part dans le code applicatif (tous
// les montants affichent "€" en dur) : le rendre modifiable donnerait
// l'illusion d'un effet qui n'existe pas. `timezone` a un vrai effet
// depuis lib/timezone.ts : corriger un fuseau mal choisi à la création
// change directement les calculs "ce mois-ci" (tableau de bord,
// rapport, gaspillage, export comptable).
export async function updateRestaurant(req: Request, res: Response) {
  const input = updateRestaurantSchema.parse(req.body);

  const restaurant = await prisma.restaurant.update({
    where: { id: req.user!.restaurantId },
    data: input,
    select: { id: true, name: true, timezone: true },
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
      // sourceFileData exclu (select explicite plutôt que omit, qui
      // demanderait une preview feature sur cette version de Prisma) :
      // des octets bruts n'ont pas leur place dans un export JSON pensé
      // pour être lisible (et Buffer se sérialise en JSON comme un
      // tableau d'un octet par élément, illisible et énorme).
      prisma.invoice.findMany({
        where: { restaurantId },
        select: {
          id: true,
          restaurantId: true,
          supplierId: true,
          status: true,
          invoiceDate: true,
          totalAmount: true,
          sourceFileMimeType: true,
          rawExtractionJson: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
          lineItems: true,
        },
      }),
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

  // Résilie l'abonnement Stripe AVANT de supprimer les données, et on
  // s'arrête net si ça échoue — contrairement au repli habituel des
  // autres intégrations externes (email/WhatsApp/SMS, où l'action
  // principale reste utile même si la notification échoue). Ici, une
  // fois le restaurant supprimé, `stripeSubscriptionId` disparaît avec
  // lui : c'était la seule trace permettant d'arrêter la facturation.
  // Le laisser filer silencieusement facturerait indéfiniment un client
  // qui a supprimé son compte, sans qu'il (ni nous) ayons plus aucun
  // moyen de le voir ou de le corriger.
  if (isBillingConfigured && stripe && needsStripeCancellation(restaurant)) {
    try {
      await stripe.subscriptions.cancel(restaurant.stripeSubscriptionId!);
    } catch (err) {
      logger.error({ err, restaurantId }, "Échec de la résiliation Stripe avant suppression RGPD — suppression annulée");
      return res.status(502).json({
        error: 'SUBSCRIPTION_CANCELLATION_FAILED',
        message:
          "Impossible de résilier l'abonnement en cours avant la suppression. Réessayez, ou contactez le support si le problème persiste.",
      });
    }
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

// Ajoute un restaurant supplémentaire au compte du Gérant déjà
// authentifié — pour un gérant de petite chaîne (2 à 10 établissements,
// public visé par le prompt d'origine, décision 0.1). Contrairement à
// bootstrap (public, tout premier compte), on ne redemande jamais de
// mot de passe : le hash existant est copié tel quel sur la nouvelle
// ligne User, l'email aussi — c'est ce qui permet à `login` de
// retrouver plus tard tous les restaurants liés à cette même personne.
// Connecte directement sur le nouveau restaurant (mêmes tokens qu'un
// bootstrap ou un login classique), comme la création du tout premier
// restaurant.
export async function addRestaurant(req: Request, res: Response) {
  const { restaurantName, currency, timezone } = addRestaurantSchema.parse(req.body);

  const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

  const restaurant = await prisma.restaurant.create({
    data: {
      name: restaurantName,
      currency,
      timezone,
      users: {
        create: {
          email: currentUser.email,
          passwordHash: currentUser.passwordHash,
          role: 'GERANT',
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          // Même personne, déjà connectée avec le compte qui a accepté
          // les CGU au bootstrap — pas une nouvelle acceptation à
          // recueillir, juste la même preuve reportée sur la nouvelle
          // ligne (comme le mot de passe, déjà copié ci-dessus).
          termsAcceptedAt: currentUser.termsAcceptedAt,
        },
      },
    },
    include: { users: true },
  });

  const newUser = restaurant.users[0];
  const accessToken = signAccessToken({ sub: newUser.id, restaurantId: restaurant.id, role: newUser.role });
  const refreshToken = signRefreshToken(newUser.id);

  await prisma.refreshToken.create({
    data: {
      userId: newUser.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: expiryDateFromDuration(env.JWT_REFRESH_EXPIRES_IN),
    },
  });

  logger.info(
    { restaurantId: restaurant.id, userId: newUser.id, linkedFromUserId: currentUser.id },
    'Restaurant supplémentaire ajouté à un compte existant',
  );

  return res.status(201).json({
    accessToken,
    refreshToken,
    user: {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: newUser.role,
      restaurantId: restaurant.id,
    },
    restaurant: { id: restaurant.id, name: restaurant.name },
  });
}

// Liste tous les restaurants liés au compte de la personne connectée
// (même email ET même hash de mot de passe, toutes ses lignes User
// actives) — alimente le sélecteur/switcher de restaurant du frontend.
//
// Le hash (pas seulement l'email) est une condition volontaire : deux
// lignes User peuvent partager le même email sans être la même
// personne (l'email n'est unique QUE par restaurant, voir le
// commentaire sur ce choix dans schema.prisma — un Gérant peut inviter
// n'importe quel email via createUser, y compris un qui appartient
// déjà à un compte sur un tout autre restaurant). Seul addRestaurant
// copie explicitement passwordHash depuis le compte d'origine au
// moment de lier un restaurant à un compte existant : c'est la seule
// garantie fiable que deux lignes User représentent la même personne
// (deux hash argon2 identiques ne peuvent jamais survenir par
// coïncidence, seulement par copie délibérée — le sel est aléatoire à
// chaque hash()). Sans cette condition, une simple collision d'email
// exposerait ici le nom d'un restaurant tiers sans aucun rapport.
export async function listMyRestaurants(req: Request, res: Response) {
  const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

  const memberships = await prisma.user.findMany({
    where: { email: currentUser.email, passwordHash: currentUser.passwordHash, isActive: true },
    select: { restaurantId: true, role: true, restaurant: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    restaurants: memberships.map((m) => ({
      id: m.restaurant.id,
      name: m.restaurant.name,
      role: m.role,
      isCurrent: m.restaurantId === req.user!.restaurantId,
    })),
  });
}

// Change le restaurant actif sans se déconnecter/reconnecter — vérifie
// que la personne a bien une ligne User sur le restaurant visé, ET
// que cette ligne représente bien la même personne (email ET hash de
// mot de passe identiques, voir le commentaire détaillé au-dessus de
// listMyRestaurants) avant d'émettre de nouveaux tokens pour ce
// contexte. Sans la condition sur le hash, quiconque parvient à faire
// exister une ligne User avec le même email qu'une victime sur un
// autre restaurant (par exemple en se faisant "inviter" par un Gérant
// complice ou en exploitant un Gérant qui invite par erreur un email
// qu'il ne contrôle pas) obtiendrait des tokens valides pour LE VRAI
// COMPTE de la victime sans jamais connaître son mot de passe — cette
// fonction ne redemande sinon jamais de mot de passe, à la différence
// de login qui vérifie le hash de chaque candidat individuellement.
export async function switchRestaurant(req: Request, res: Response) {
  const { restaurantId } = switchRestaurantSchema.parse(req.body);

  const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const target = await prisma.user.findFirst({
    where: { email: currentUser.email, passwordHash: currentUser.passwordHash, restaurantId, isActive: true },
  });
  if (!target) {
    return res.status(403).json({ error: 'FORBIDDEN', message: "Tu n'as pas accès à ce restaurant." });
  }

  const accessToken = signAccessToken({ sub: target.id, restaurantId: target.restaurantId, role: target.role });
  const refreshToken = signRefreshToken(target.id);

  await prisma.refreshToken.create({
    data: {
      userId: target.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: expiryDateFromDuration(env.JWT_REFRESH_EXPIRES_IN),
    },
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: target.id,
      email: target.email,
      firstName: target.firstName,
      lastName: target.lastName,
      role: target.role,
      restaurantId: target.restaurantId,
    },
  });
}

// Vue consolidée multi-restaurants (Phase 6+, chantier reporté puis
// repris sur demande explicite le 25/07/2026) : agrège la même
// donnée que le tableau de bord (Phase 2), un appel par restaurant lié
// au compte, plus des totaux/moyennes globaux. Une marge moyenne
// pondérée par plat (pas une simple moyenne de moyennes) donnerait un
// résultat plus juste, mais demanderait de sortir les plats bruts par
// restaurant ; la moyenne simple est un compromis assumé et documenté,
// ajustable si besoin plus tard.
export async function getConsolidatedDashboard(req: Request, res: Response) {
  const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

  const memberships = await prisma.user.findMany({
    where: { email: currentUser.email, isActive: true },
    select: { restaurantId: true, restaurant: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const perRestaurant = await Promise.all(
    memberships.map(async (m) => ({
      restaurantId: m.restaurant.id,
      restaurantName: m.restaurant.name,
      ...(await gatherDashboardData(m.restaurant.id)),
    })),
  );

  const withMargin = perRestaurant.filter((r) => r.kpis.averageMarginRatio !== null);
  const totals = {
    restaurantCount: perRestaurant.length,
    averageMarginRatio:
      withMargin.length > 0
        ? withMargin.reduce((sum, r) => sum + (r.kpis.averageMarginRatio ?? 0), 0) / withMargin.length
        : null,
    totalPotentialSavings: perRestaurant.reduce((sum, r) => sum + r.kpis.potentialSavings, 0),
    totalWasteThisMonth: perRestaurant.reduce((sum, r) => sum + r.kpis.wasteThisMonth, 0),
    totalRedAlerts: perRestaurant.reduce((sum, r) => sum + r.kpis.redCount, 0),
  };

  res.json({ totals, restaurants: perRestaurant });
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
