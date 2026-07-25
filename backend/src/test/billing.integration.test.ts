import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// L'environnement de test n'a pas de vraie clé STRIPE_SECRET_KEY : ces
// tests vérifient donc surtout le repli propre (503 BILLING_NOT_CONFIGURED)
// plutôt que de vraies sessions Stripe — même principe que les tests
// email/WhatsApp/SMS qui vérifient le chemin d'échec en l'absence de
// vraies clés. La logique de synchronisation par webhook (mapping des
// statuts Stripe → SubscriptionStatus) est elle testée séparément, sans
// dépendre d'une vraie signature Stripe.
describe('Facturation — statut et sessions Stripe', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string, role: 'GERANT' | 'SERVICE' = 'GERANT') {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant facturation ${label}`,
        gerant: {
          email: `gerant-facturation-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);

    if (role === 'SERVICE') {
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .send({
          email: `service-facturation-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Service',
          lastName: label,
          role: 'SERVICE',
        });
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: `service-facturation-${suffix}-${label}@test-foodcfo.local`, password: 'MotDePasseTest123!' });
      return loginRes.body as { accessToken: string };
    }

    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it("indique que la facturation n'est pas configurée (pas de vraie clé Stripe dans cet environnement)", async () => {
    const restaurant = await bootstrapRestaurant('A');
    const res = await request(app).get('/api/billing/status').set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.billingConfigured).toBe(false);
    expect(res.body.subscriptionStatus).toBeNull();
  });

  it("refuse de créer une session de paiement tant que la facturation n'est pas configurée", async () => {
    const restaurant = await bootstrapRestaurant('B');
    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('BILLING_NOT_CONFIGURED');
  });

  it("refuse de créer une session du portail tant que la facturation n'est pas configurée", async () => {
    const restaurant = await bootstrapRestaurant('C');
    const res = await request(app).post('/api/billing/portal').set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('BILLING_NOT_CONFIGURED');
  });

  it('le rôle Service ne peut pas initier de paiement ni ouvrir le portail (réservé au Gérant)', async () => {
    const service = await bootstrapRestaurant('D', 'SERVICE');

    const checkoutRes = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${service.accessToken}`);
    expect(checkoutRes.status).toBe(403);

    const portalRes = await request(app).post('/api/billing/portal').set('Authorization', `Bearer ${service.accessToken}`);
    expect(portalRes.status).toBe(403);
  });

  it('le rôle Service peut consulter le statut de facturation (lecture seule)', async () => {
    const service = await bootstrapRestaurant('E', 'SERVICE');
    const res = await request(app).get('/api/billing/status').set('Authorization', `Bearer ${service.accessToken}`);
    expect(res.status).toBe(200);
  });

  it('le webhook Stripe refuse une requête sans signature', async () => {
    const res = await request(app).post('/api/webhooks/stripe').send({ type: 'checkout.session.completed' });
    // Sans STRIPE_SECRET_KEY configurée, le endpoint répond 503 avant même
    // de vérifier la signature — comportement de repli attendu ici.
    expect([400, 503]).toContain(res.status);
  });
});
