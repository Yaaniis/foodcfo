import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { stripe, isBillingConfigured } from '../lib/stripe';
import { env } from '../config/env';

// Mapping explicite plutôt qu'un cast : Stripe utilise des statuts en
// snake_case minuscule, notre enum Prisma les mêmes noms en majuscules —
// un mapping exhaustif fait échouer la compilation si Stripe ajoute un
// jour un nouveau statut, plutôt qu'un cast qui masquerait l'écart.
export const STRIPE_STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  unpaid: SubscriptionStatus.UNPAID,
  paused: SubscriptionStatus.PAUSED,
};

// Extrait de handleStripeWebhook pour être testable directement — aucune
// vraie clé Stripe n'existe dans cet environnement, impossible de
// générer une signature de webhook valide pour tester via le endpoint
// HTTP. Traduit un objet Stripe.Subscription en données prêtes pour
// Prisma, sans dépendance à Express ni à un appel réseau Stripe.
export function subscriptionToRestaurantUpdate(subscription: Stripe.Subscription) {
  return {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: STRIPE_STATUS_MAP[subscription.status],
    subscriptionCurrentPeriodEnd: new Date(subscription.items.data[0]!.current_period_end * 1000),
  };
}

// Statut d'abonnement du restaurant courant + indique si la facturation
// en ligne est configurée du tout (clé Stripe absente = fonctionnalité
// simplement masquée côté frontend, pas une erreur).
export async function getBillingStatus(req: Request, res: Response) {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: req.user!.restaurantId },
    select: { subscriptionStatus: true, subscriptionCurrentPeriodEnd: true },
  });
  res.json({
    billingConfigured: isBillingConfigured,
    subscriptionStatus: restaurant.subscriptionStatus,
    subscriptionCurrentPeriodEnd: restaurant.subscriptionCurrentPeriodEnd,
  });
}

// Crée une session Stripe Checkout pour souscrire à l'abonnement
// (Price défini côté Stripe via STRIPE_PRICE_ID — aucun montant codé en
// dur ici). Réutilise le Customer Stripe existant s'il y en a déjà un
// (ex : abonnement précédent résilié) plutôt que d'en recréer un à
// chaque tentative, ce qui fragmenterait l'historique de facturation.
export async function createCheckoutSession(req: Request, res: Response) {
  if (!isBillingConfigured || !stripe) {
    return res
      .status(503)
      .json({ error: 'BILLING_NOT_CONFIGURED', message: "La facturation en ligne n'est pas encore configurée." });
  }

  const [restaurant, user] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: req.user!.restaurantId } }),
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }),
  ]);

  let customerId = restaurant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: { restaurantId: restaurant.id },
    });
    customerId = customer.id;
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${env.FRONTEND_URL}/billing?checkout=success`,
    cancel_url: `${env.FRONTEND_URL}/billing?checkout=cancelled`,
    client_reference_id: restaurant.id,
  });

  res.json({ url: session.url });
}

// Portail Stripe en libre-service : le Gérant y change son moyen de
// paiement, résilie ou consulte ses factures, sans qu'on ait à
// reconstruire cette UI nous-mêmes.
export async function createPortalSession(req: Request, res: Response) {
  if (!isBillingConfigured || !stripe) {
    return res
      .status(503)
      .json({ error: 'BILLING_NOT_CONFIGURED', message: "La facturation en ligne n'est pas encore configurée." });
  }

  const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: req.user!.restaurantId } });
  if (!restaurant.stripeCustomerId) {
    return res
      .status(400)
      .json({ error: 'NO_SUBSCRIPTION', message: "Aucun abonnement n'a encore été initié pour ce restaurant." });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: restaurant.stripeCustomerId,
    return_url: `${env.FRONTEND_URL}/billing`,
  });

  res.json({ url: session.url });
}

// Synchronise Restaurant.subscriptionStatus depuis les évènements Stripe
// — jamais l'inverse (Stripe reste la seule source de vérité sur l'état
// réel de l'abonnement/paiement). Monté hors du router versionné
// classique : nécessite le corps brut de la requête pour vérifier la
// signature, donc branché avant express.json() dans app.ts.
export async function handleStripeWebhook(req: Request, res: Response) {
  if (!isBillingConfigured || !stripe) {
    return res.status(503).send('Billing not configured');
  }

  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    return res.status(400).send('Missing Stripe signature');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    logger.warn({ err }, 'Signature de webhook Stripe invalide');
    return res.status(400).send('Invalid signature');
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.client_reference_id && session.subscription) {
        await prisma.restaurant.update({
          where: { id: session.client_reference_id },
          data: { stripeSubscriptionId: String(session.subscription) },
        });
      }
      break;
    }
    // customer.subscription.created (pas .updated) est l'évènement que
    // Stripe envoie pour un tout premier abonnement — sans lui, le
    // statut d'un nouvel abonné resterait `null` indéfiniment après un
    // paiement pourtant réussi, jusqu'au prochain renouvellement (un
    // mois plus tard). Couvre aussi les mises à jour de statut
    // (paiement réussi/échoué, passage past_due) et la résiliation —
    // customer.subscription.deleted envoie le même statut "canceled",
    // on utilise directement subscription.status dans tous les cas.
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const restaurant = await prisma.restaurant.findFirst({ where: { stripeCustomerId: String(subscription.customer) } });
      if (restaurant) {
        await prisma.restaurant.update({
          where: { id: restaurant.id },
          data: subscriptionToRestaurantUpdate(subscription),
        });
      }
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
}
