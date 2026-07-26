import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

describe('Gaspillage — déclaration, valorisation, statistiques', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant gaspillage ${label}`,
        gerant: {
          email: `gerant-gaspi-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  async function setupSupplierAndProduct(token: string, category: string, priceHT: number) {
    const supplier = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Fournisseur ${category}`, category, preferredChannel: 'EMAIL' });

    const product = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: supplier.body.supplier.id, name: 'Filet de bœuf', unit: 'KG', currentPriceHT: priceHT });

    return { supplierId: supplier.body.supplier.id as string, productId: product.body.product.id as string };
  }

  afterAll(async () => {
    // `RecipeIngredient.productId` a un onDelete: Restrict (comme
    // `OrderLineItem.productId`, voir order.integration.test.ts) : on
    // supprime les plats (cascade vers leurs fiches techniques) avant
    // les restaurants, pour ne pas entrer en conflit avec la cascade
    // Restaurant → Product.
    await prisma.wasteEntry.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('valorise correctement une perte de produit brut (quantité × prix HT)', async () => {
    const restaurant = await bootstrapRestaurant('A');
    const { productId } = await setupSupplierAndProduct(restaurant.accessToken, 'Boucherie', 20);

    const res = await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ productId, quantity: 2, reason: 'PERIME' });

    expect(res.status).toBe(201);
    expect(Number(res.body.wasteEntry.estimatedValue)).toBe(40);
  });

  it("valorise correctement une perte de plat fini (quantité × coût matière de la fiche technique)", async () => {
    const restaurant = await bootstrapRestaurant('B');
    const { productId } = await setupSupplierAndProduct(restaurant.accessToken, 'Boucherie', 20);

    const menuItemRes = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ name: 'Tartare', category: 'Plats', sellingPriceTTC: 24, vatRate: 'TAUX_10' });
    const menuItemId = menuItemRes.body.menuItem.id as string;

    await request(app)
      .put(`/api/menu-items/${menuItemId}/recipe`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ ingredients: [{ productId, quantity: 0.2 }] });

    const res = await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ menuItemId, quantity: 3, reason: 'INVENDU' });

    expect(res.status).toBe(201);
    // Coût matière du plat = 0.2 * 20 = 4 € ; 3 assiettes jetées = 12 €.
    expect(Number(res.body.wasteEntry.estimatedValue)).toBe(12);
  });

  it("refuse de déclarer une perte sur un plat sans fiche technique", async () => {
    const restaurant = await bootstrapRestaurant('C');
    const menuItemRes = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ name: 'Sans fiche', category: 'Plats', sellingPriceTTC: 15, vatRate: 'TAUX_10' });

    const res = await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ menuItemId: menuItemRes.body.menuItem.id, quantity: 1, reason: 'AUTRE' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NO_RECIPE');
  });

  it('refuse une déclaration sans produit ni plat, ou avec les deux à la fois', async () => {
    const restaurant = await bootstrapRestaurant('D');
    const { productId } = await setupSupplierAndProduct(restaurant.accessToken, 'Boucherie', 10);

    const neitherRes = await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ quantity: 1, reason: 'AUTRE' });
    expect(neitherRes.status).toBe(400);

    const menuItemRes = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ name: 'Plat', category: 'Plats', sellingPriceTTC: 15, vatRate: 'TAUX_10' });

    const bothRes = await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ productId, menuItemId: menuItemRes.body.menuItem.id, quantity: 1, reason: 'AUTRE' });
    expect(bothRes.status).toBe(400);
  });

  it('agrège les statistiques du mois par motif et par catégorie', async () => {
    const restaurant = await bootstrapRestaurant('E');
    const { productId } = await setupSupplierAndProduct(restaurant.accessToken, 'Boucherie', 10);

    await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ productId, quantity: 1, reason: 'PERIME' });
    await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ productId, quantity: 2, reason: 'ERREUR_PREPARATION' });

    const statsRes = await request(app)
      .get('/api/waste/stats')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.entryCount).toBe(2);
    expect(statsRes.body.totalValue).toBe(30);
    expect(statsRes.body.byReason.PERIME).toBe(10);
    expect(statsRes.body.byReason.ERREUR_PREPARATION).toBe(20);
    expect(statsRes.body.byCategory).toEqual([{ category: 'Boucherie', value: 30 }]);
  });

  it('expose le gaspillage du mois dans les KPIs du tableau de bord', async () => {
    const restaurant = await bootstrapRestaurant('F');
    const { productId } = await setupSupplierAndProduct(restaurant.accessToken, 'Boucherie', 15);

    await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ productId, quantity: 1, reason: 'PERIME' });

    const dashboardRes = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body.kpis.wasteThisMonth).toBe(15);
  });

  it('supprime une déclaration de perte erronée (double-saisie, mauvais produit)', async () => {
    const restaurant = await bootstrapRestaurant('J');
    const { productId } = await setupSupplierAndProduct(restaurant.accessToken, 'Boucherie', 20);

    const createRes = await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ productId, quantity: 2, reason: 'PERIME' });
    const wasteEntryId = createRes.body.wasteEntry.id as string;

    const deleteRes = await request(app)
      .delete(`/api/waste/${wasteEntryId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app).get('/api/waste').set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(listRes.body.wasteEntries).toHaveLength(0);
  });

  it("isolation multi-tenant : impossible de supprimer une déclaration d'un autre restaurant", async () => {
    const restaurantA = await bootstrapRestaurant('K');
    const restaurantB = await bootstrapRestaurant('L');
    const { productId } = await setupSupplierAndProduct(restaurantA.accessToken, 'Boucherie', 10);

    const createRes = await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ productId, quantity: 1, reason: 'PERIME' });
    const wasteEntryId = createRes.body.wasteEntry.id as string;

    const deleteRes = await request(app)
      .delete(`/api/waste/${wasteEntryId}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(deleteRes.status).toBe(404);

    const stillExists = await prisma.wasteEntry.findUnique({ where: { id: wasteEntryId } });
    expect(stillExists).not.toBeNull();
  });

  it("isolation multi-tenant : un restaurant ne voit pas les pertes d'un autre", async () => {
    const restaurantA = await bootstrapRestaurant('G');
    const restaurantB = await bootstrapRestaurant('H');
    const { productId } = await setupSupplierAndProduct(restaurantA.accessToken, 'Boucherie', 10);

    await request(app)
      .post('/api/waste')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ productId, quantity: 1, reason: 'PERIME' });

    const listFromB = await request(app)
      .get('/api/waste')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listFromB.body.wasteEntries).toHaveLength(0);
  });

  it('le rôle Service ne peut pas accéder au gaspillage (décision 0.5)', async () => {
    const restaurant = await bootstrapRestaurant('I');
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({
        email: `service-gaspi-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Service',
        lastName: 'Test',
        role: 'SERVICE',
      });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: `service-gaspi-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    const listRes = await request(app)
      .get('/api/waste')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);
    expect(listRes.status).toBe(403);
  });
});
