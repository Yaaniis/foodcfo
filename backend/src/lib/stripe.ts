// Client Stripe partagé pour la facturation (Phase « clé en main »,
// hors plan initial). Même principe de repli que les autres intégrations
// externes (email.ts, whatsapp.ts, sms.ts, invoiceExtraction.ts) : sans
// clé valide, `stripe` est `null` et les endpoints de facturation
// renvoient une erreur claire plutôt que de planter au démarrage.

import Stripe from 'stripe';
import { env } from '../config/env';

function looksLikePlaceholder(): boolean {
  // Une clé secrète Stripe (test ou live) commence toujours par "sk_".
  return !env.STRIPE_SECRET_KEY || !env.STRIPE_SECRET_KEY.startsWith('sk_');
}

export const isBillingConfigured = !looksLikePlaceholder() && Boolean(env.STRIPE_PRICE_ID);

export const stripe = looksLikePlaceholder()
  ? null
  : new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: '2026-06-24.dahlia' });

export class BillingError extends Error {}
