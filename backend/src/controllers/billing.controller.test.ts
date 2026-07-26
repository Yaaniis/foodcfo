import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import { SubscriptionStatus } from '@prisma/client';
import { subscriptionToRestaurantUpdate, needsStripeCancellation, STRIPE_STATUS_MAP } from './billing.controller';

// Construit un objet minimal mais fidèle à la forme réelle d'un
// Stripe.Subscription — seuls les champs lus par
// subscriptionToRestaurantUpdate sont renseignés, le reste est
// `as unknown as Stripe.Subscription` pour ne pas avoir à mocker
// l'intégralité (volumineuse) du type Stripe.
function fakeSubscription(overrides: {
  id: string;
  status: Stripe.Subscription.Status;
  currentPeriodEndUnix: number;
}): Stripe.Subscription {
  return {
    id: overrides.id,
    status: overrides.status,
    items: { data: [{ current_period_end: overrides.currentPeriodEndUnix }] },
  } as unknown as Stripe.Subscription;
}

describe('subscriptionToRestaurantUpdate', () => {
  it('traduit un abonnement actif en données Prisma correctes', () => {
    const subscription = fakeSubscription({ id: 'sub_123', status: 'active', currentPeriodEndUnix: 1735689600 });
    const result = subscriptionToRestaurantUpdate(subscription);

    expect(result.stripeSubscriptionId).toBe('sub_123');
    expect(result.subscriptionStatus).toBe('ACTIVE');
    // Stripe donne des secondes Unix, Prisma/JS attend des millisecondes.
    expect(result.subscriptionCurrentPeriodEnd).toEqual(new Date(1735689600 * 1000));
  });

  // Couvre explicitement le scénario du bug corrigé cette session : un
  // tout premier abonnement (évènement customer.subscription.created,
  // pas .updated) doit produire un statut ACTIF exploitable, pas rester
  // bloqué à `null`.
  it("mappe correctement un tout nouvel abonnement (scénario de l'évènement 'created')", () => {
    const subscription = fakeSubscription({ id: 'sub_new', status: 'active', currentPeriodEndUnix: 1735689600 });
    const result = subscriptionToRestaurantUpdate(subscription);
    expect(result.subscriptionStatus).toBe('ACTIVE');
  });

  it('mappe chaque statut Stripe vers l’enum Prisma attendu', () => {
    for (const [stripeStatus, prismaStatus] of Object.entries(STRIPE_STATUS_MAP)) {
      const subscription = fakeSubscription({
        id: 'sub_x',
        status: stripeStatus as Stripe.Subscription.Status,
        currentPeriodEndUnix: 1735689600,
      });
      expect(subscriptionToRestaurantUpdate(subscription).subscriptionStatus).toBe(prismaStatus);
    }
  });

  it('mappe la résiliation (canceled) correctement', () => {
    const subscription = fakeSubscription({ id: 'sub_456', status: 'canceled', currentPeriodEndUnix: 1735689600 });
    expect(subscriptionToRestaurantUpdate(subscription).subscriptionStatus).toBe('CANCELED');
  });
});

// Couvre le bug corrigé en même temps que la suppression RGPD
// (restaurant.controller.ts) : sans ce garde-fou, un restaurant ayant
// eu un abonnement continuait d'être facturé indéfiniment après la
// suppression de son compte, faute de toute trace permettant de
// résilier après coup.
describe('needsStripeCancellation', () => {
  it("vrai si un abonnement existe et n'est pas déjà résilié", () => {
    expect(needsStripeCancellation({ stripeSubscriptionId: 'sub_1', subscriptionStatus: SubscriptionStatus.ACTIVE })).toBe(
      true,
    );
    expect(
      needsStripeCancellation({ stripeSubscriptionId: 'sub_1', subscriptionStatus: SubscriptionStatus.PAST_DUE }),
    ).toBe(true);
  });

  it("faux si aucun abonnement n'a jamais été créé", () => {
    expect(needsStripeCancellation({ stripeSubscriptionId: null, subscriptionStatus: null })).toBe(false);
  });

  it('faux si déjà résilié — évite un appel Stripe inutile qui échouerait', () => {
    expect(
      needsStripeCancellation({ stripeSubscriptionId: 'sub_1', subscriptionStatus: SubscriptionStatus.CANCELED }),
    ).toBe(false);
  });
});
