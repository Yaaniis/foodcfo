import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Phase 9 — couche backend du rapprochement vente caisse / plat de la
// carte. Pas de endpoint public de création de vente : contrairement aux
// factures (repli de saisie manuelle explicitement voulu), une vente
// caisse doit toujours provenir de la caisse elle-même (webhook/polling,
// pas encore construit — voir FoodCFO_PLAN.md Phase 9) — la ressaisir à
// la main contredirait l'objectif même de cette phase. Les ventes de
// test sont donc injectées directement via Prisma, comme le fera plus
// tard le futur récepteur de webhook, pas via l'API HTTP publique.
describe('POS — connexions caisse et rapprochement des ventes', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant pos ${label}`,
        gerant: {
          email: `gerant-pos-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  async function addTeamMember(gerantToken: string, label: string, role: 'CUISINE' | 'SERVICE') {
    const email = `membre-pos-${suffix}-${label}@test-foodcfo.local`;
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${gerantToken}`)
      .send({ email, password: 'MotDePasseTest123!', firstName: 'Membre', lastName: label, role });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'MotDePasseTest123!' });
    return loginRes.body.accessToken as string;
  }

  async function createMenuItem(token: string, name = 'Burger Classic') {
    const res = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, category: 'Plats', sellingPriceTTC: 15, vatRate: 'TAUX_10' });
    return res.body.menuItem.id as string;
  }

  async function seedSale(
    restaurantId: string,
    posConnectionId: string,
    externalId: string,
    lineItems: { rawLabel: string; menuItemId?: string | null; quantity: number; unitPriceTTC: number; totalPriceTTC: number }[],
  ) {
    return prisma.posSale.create({
      data: {
        restaurantId,
        posConnectionId,
        externalId,
        soldAt: new Date(),
        totalAmount: lineItems.reduce((sum, l) => sum + l.totalPriceTTC, 0),
        lineItems: { create: lineItems },
      },
      include: { lineItems: true },
    });
  }

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('crée une connexion caisse, la liste, refuse une deuxième connexion active, permet une reconnexion après déconnexion', async () => {
    const restaurant = await bootstrapRestaurant('A');

    const created = await request(app)
      .post('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ provider: 'ZELTY' });
    expect(created.status).toBe(201);
    expect(created.body.connection.provider).toBe('ZELTY');
    expect(created.body.connection.isActive).toBe(true);

    const second = await request(app)
      .post('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ provider: 'LADDITION' });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('CONNECTION_ALREADY_ACTIVE');

    const list = await request(app)
      .get('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(list.body.connections).toHaveLength(1);

    const disconnect = await request(app)
      .post(`/api/pos/connections/${created.body.connection.id}/disconnect`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(disconnect.status).toBe(200);
    expect(disconnect.body.connection.isActive).toBe(false);
    expect(disconnect.body.connection.disconnectedAt).not.toBeNull();

    const redisconnect = await request(app)
      .post(`/api/pos/connections/${created.body.connection.id}/disconnect`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(redisconnect.status).toBe(409);

    const reconnect = await request(app)
      .post('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ provider: 'LADDITION' });
    expect(reconnect.status).toBe(201);
  });

  it('réservé au Gérant : Cuisine et Service n\'ont pas accès à la gestion des connexions caisse', async () => {
    const restaurant = await bootstrapRestaurant('B');
    const cuisineToken = await addTeamMember(restaurant.accessToken, 'Cuistot', 'CUISINE');
    const serviceToken = await addTeamMember(restaurant.accessToken, 'Serveur', 'SERVICE');

    for (const token of [cuisineToken, serviceToken]) {
      const res = await request(app).get('/api/pos/connections').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it('isolation multi-tenant : un restaurant ne voit ni ne déconnecte les connexions caisse d\'un autre', async () => {
    const restaurantA = await bootstrapRestaurant('C');
    const restaurantB = await bootstrapRestaurant('D');

    const connA = await request(app)
      .post('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ provider: 'INNOVORDER' });

    const listB = await request(app)
      .get('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listB.body.connections).toHaveLength(0);

    const disconnectCrossTenant = await request(app)
      .post(`/api/pos/connections/${connA.body.connection.id}/disconnect`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(disconnectCrossTenant.status).toBe(404);
  });

  it('liste les ventes avec l\'indicateur needsReview, accessible au Gérant et à la Cuisine mais pas au Service', async () => {
    const restaurant = await bootstrapRestaurant('E');
    const cuisineToken = await addTeamMember(restaurant.accessToken, 'Cuistot', 'CUISINE');
    const serviceToken = await addTeamMember(restaurant.accessToken, 'Serveur', 'SERVICE');
    const menuItemId = await createMenuItem(restaurant.accessToken, 'Burger Classic');

    const conn = await request(app)
      .post('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ provider: 'ZELTY' });
    const restaurantId = restaurant.user.restaurantId;

    await seedSale(restaurantId, conn.body.connection.id, 'ticket-resolu', [
      { rawLabel: 'Burger Classic', menuItemId, quantity: 1, unitPriceTTC: 15, totalPriceTTC: 15 },
    ]);
    await seedSale(restaurantId, conn.body.connection.id, 'ticket-a-revoir', [
      { rawLabel: 'Plat non reconnu', menuItemId: null, quantity: 1, unitPriceTTC: 12, totalPriceTTC: 12 },
    ]);

    const listGerant = await request(app).get('/api/pos/sales').set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(listGerant.status).toBe(200);
    expect(listGerant.body.sales).toHaveLength(2);
    const resolved = listGerant.body.sales.find((s: { externalId: string }) => s.externalId === 'ticket-resolu');
    const toReview = listGerant.body.sales.find((s: { externalId: string }) => s.externalId === 'ticket-a-revoir');
    expect(resolved.needsReview).toBe(false);
    expect(toReview.needsReview).toBe(true);

    const listCuisine = await request(app).get('/api/pos/sales').set('Authorization', `Bearer ${cuisineToken}`);
    expect(listCuisine.status).toBe(200);

    const listService = await request(app).get('/api/pos/sales').set('Authorization', `Bearer ${serviceToken}`);
    expect(listService.status).toBe(403);
  });

  it('corrige une ligne de vente manuellement (plat, quantité, prix) et marque wasManuallyEdited', async () => {
    const restaurant = await bootstrapRestaurant('F');
    const menuItemId = await createMenuItem(restaurant.accessToken, 'Salade César');
    const conn = await request(app)
      .post('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ provider: 'ZELTY' });

    const sale = await seedSale(restaurant.user.restaurantId, conn.body.connection.id, 'ticket-correction', [
      { rawLabel: 'Salade Cesar (non reconnu)', menuItemId: null, quantity: 1, unitPriceTTC: 11, totalPriceTTC: 11 },
    ]);
    const lineId = sale.lineItems[0].id;

    const corrected = await request(app)
      .patch(`/api/pos/sales/${sale.id}/line-items/${lineId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ menuItemId, quantity: 2, unitPriceTTC: 11, totalPriceTTC: 22 });
    expect(corrected.status).toBe(200);
    expect(corrected.body.line.menuItemId).toBe(menuItemId);
    expect(Number(corrected.body.line.quantity)).toBe(2);
    expect(corrected.body.line.wasManuallyEdited).toBe(true);
    // Le libellé brut d'origine reste inchangé après rapprochement — audit.
    expect(corrected.body.line.rawLabel).toBe('Salade Cesar (non reconnu)');
  });

  it('refuse de rapprocher une ligne de vente avec un plat d\'un autre restaurant', async () => {
    const restaurantA = await bootstrapRestaurant('G');
    const restaurantB = await bootstrapRestaurant('H');
    const menuItemB = await createMenuItem(restaurantB.accessToken, 'Plat de B');

    const conn = await request(app)
      .post('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ provider: 'ZELTY' });
    const sale = await seedSale(restaurantA.user.restaurantId, conn.body.connection.id, 'ticket-cross-tenant', [
      { rawLabel: 'Plat X', menuItemId: null, quantity: 1, unitPriceTTC: 10, totalPriceTTC: 10 },
    ]);

    const res = await request(app)
      .patch(`/api/pos/sales/${sale.id}/line-items/${sale.lineItems[0].id}`)
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ menuItemId: menuItemB });
    expect(res.status).toBe(404);
  });

  it('isolation multi-tenant : un restaurant ne voit ni ne corrige les ventes d\'un autre', async () => {
    const restaurantA = await bootstrapRestaurant('I');
    const restaurantB = await bootstrapRestaurant('J');

    const conn = await request(app)
      .post('/api/pos/connections')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ provider: 'ZELTY' });
    const sale = await seedSale(restaurantA.user.restaurantId, conn.body.connection.id, 'ticket-isolation', [
      { rawLabel: 'Plat X', menuItemId: null, quantity: 1, unitPriceTTC: 10, totalPriceTTC: 10 },
    ]);

    const listB = await request(app).get('/api/pos/sales').set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listB.body.sales).toHaveLength(0);

    const patchCrossTenant = await request(app)
      .patch(`/api/pos/sales/${sale.id}/line-items/${sale.lineItems[0].id}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`)
      .send({ quantity: 5 });
    expect(patchCrossTenant.status).toBe(404);
  });
});
