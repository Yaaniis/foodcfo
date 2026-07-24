import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// L'environnement de test n'a pas de vraie clé RESEND_API_KEY (voir
// .env.example / journal de bord) : l'envoi automatique échoue donc
// systématiquement ici, ce qui permet de vérifier en conditions réelles
// que la commande reste exploitable (message généré disponible pour un
// envoi manuel) plutôt que de planter.
describe('Commandes fournisseurs — panier, envoi, statuts', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant commande ${label}`,
        gerant: {
          email: `gerant-commande-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  async function setupSupplierAndProduct(token: string, name: string, contactEmail?: string) {
    const supplier = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, category: 'Test', preferredChannel: 'EMAIL', contactEmail });

    const product = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: supplier.body.supplier.id, name: `Produit ${name}`, unit: 'KG', currentPriceHT: 10 });

    return { supplierId: supplier.body.supplier.id as string, productId: product.body.product.id as string };
  }

  afterAll(async () => {
    // `OrderLineItem.productId` a un onDelete: Restrict (jamais de
    // suppression silencieuse d'un produit référencé par une commande).
    // La cascade Restaurant → Product entrerait donc en conflit avec des
    // OrderLineItem encore existants : on supprime d'abord les commandes
    // (ce qui cascade vers leurs lignes) avant de supprimer les
    // restaurants de test.
    await prisma.order.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('groupe le panier en une commande brouillon distincte par fournisseur', async () => {
    const restaurant = await bootstrapRestaurant('A');
    const supplierA = await setupSupplierAndProduct(restaurant.accessToken, 'Boucherie');
    const supplierB = await setupSupplierAndProduct(restaurant.accessToken, 'Poissonnerie');

    const res = await request(app)
      .post('/api/orders/from-cart')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({
        items: [
          { productId: supplierA.productId, quantity: 5 },
          { productId: supplierB.productId, quantity: 3 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.orders).toHaveLength(2);
    const supplierIds = (res.body.orders as { supplier: { id: string } }[]).map((o) => o.supplier.id).sort();
    expect(supplierIds).toEqual([supplierA.supplierId, supplierB.supplierId].sort());
    for (const order of res.body.orders) {
      expect(order.status).toBe('DRAFT');
      expect(order.lineItems).toHaveLength(1);
    }
  });

  it("bascule sur le repli manuel quand l'envoi email échoue (pas de vraie clé Resend), et refuse d'envoyer une commande déjà envoyée", async () => {
    const restaurant = await bootstrapRestaurant('B');
    const supplier = await setupSupplierAndProduct(
      restaurant.accessToken,
      'Fournisseur',
      'contact@fournisseur-test.local',
    );

    const cartRes = await request(app)
      .post('/api/orders/from-cart')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ items: [{ productId: supplier.productId, quantity: 10 }] });
    const orderId = cartRes.body.orders[0].id as string;

    const sendRes = await request(app)
      .post(`/api/orders/${orderId}/send`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(sendRes.status).toBe(502);
    expect(sendRes.body.error).toBe('EMAIL_SEND_FAILED');
    expect(sendRes.body.generatedMessage.text).toContain('Produit Fournisseur');
    expect(sendRes.body.generatedMessage.text).toContain('10 kg');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('DRAFT');

    // Deuxième tentative après un échec doit toujours être possible
    // (la commande est restée en DRAFT) — mais si on force manuellement
    // son statut à SENT, un nouvel envoi doit être refusé.
    await prisma.order.update({ where: { id: orderId }, data: { status: 'SENT', sentAt: new Date() } });
    const secondSendRes = await request(app)
      .post(`/api/orders/${orderId}/send`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(secondSendRes.status).toBe(400);
    expect(secondSendRes.body.error).toBe('INVALID_STATUS');
  });

  it("refuse l'envoi si le fournisseur n'a pas d'email de contact", async () => {
    const restaurant = await bootstrapRestaurant('C');
    const supplier = await setupSupplierAndProduct(restaurant.accessToken, 'SansEmail');

    const cartRes = await request(app)
      .post('/api/orders/from-cart')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ items: [{ productId: supplier.productId, quantity: 2 }] });
    const orderId = cartRes.body.orders[0].id as string;

    const sendRes = await request(app)
      .post(`/api/orders/${orderId}/send`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(sendRes.status).toBe(400);
    expect(sendRes.body.error).toBe('MISSING_CONTACT_EMAIL');
  });

  it('respecte les transitions de statut autorisées (DRAFT → SENT → CONFIRMED → DELIVERED)', async () => {
    const restaurant = await bootstrapRestaurant('D');
    const supplier = await setupSupplierAndProduct(restaurant.accessToken, 'Transitions');

    const cartRes = await request(app)
      .post('/api/orders/from-cart')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ items: [{ productId: supplier.productId, quantity: 1 }] });
    const orderId = cartRes.body.orders[0].id as string;

    // Impossible de confirmer une commande encore en brouillon.
    const prematureConfirm = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ status: 'CONFIRMED' });
    expect(prematureConfirm.status).toBe(400);
    expect(prematureConfirm.body.error).toBe('INVALID_TRANSITION');

    await prisma.order.update({ where: { id: orderId }, data: { status: 'SENT', sentAt: new Date() } });

    const confirmRes = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ status: 'CONFIRMED' });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.order.status).toBe('CONFIRMED');
    expect(confirmRes.body.order.confirmedAt).toBeTruthy();

    const deliverRes = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ status: 'DELIVERED' });
    expect(deliverRes.status).toBe(200);
    expect(deliverRes.body.order.status).toBe('DELIVERED');
    expect(deliverRes.body.order.deliveredAt).toBeTruthy();
  });

  it("suggère la quantité de la commande précédente pour un produit déjà commandé", async () => {
    const restaurant = await bootstrapRestaurant('E');
    const supplier = await setupSupplierAndProduct(restaurant.accessToken, 'Historique');

    await request(app)
      .post('/api/orders/from-cart')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ items: [{ productId: supplier.productId, quantity: 7 }] });

    const suggestionsRes = await request(app)
      .get('/api/orders/suggestions')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(suggestionsRes.status).toBe(200);
    expect(suggestionsRes.body.suggestions[supplier.productId]).toBe(7);
  });

  it('isolation multi-tenant : un restaurant ne peut pas voir ou modifier la commande d\'un autre', async () => {
    const restaurantA = await bootstrapRestaurant('F');
    const restaurantB = await bootstrapRestaurant('G');
    const supplier = await setupSupplierAndProduct(restaurantA.accessToken, 'Isole');

    const cartRes = await request(app)
      .post('/api/orders/from-cart')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ items: [{ productId: supplier.productId, quantity: 1 }] });
    const orderId = cartRes.body.orders[0].id as string;

    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(getRes.status).toBe(404);

    const statusRes = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`)
      .send({ status: 'CANCELLED' });
    expect(statusRes.status).toBe(404);
  });

  it('le rôle Service ne peut pas accéder aux commandes (décision 0.5)', async () => {
    const restaurant = await bootstrapRestaurant('H');
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({
        email: `service-commande-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Service',
        lastName: 'Test',
        role: 'SERVICE',
      });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: `service-commande-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    const listRes = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);
    expect(listRes.status).toBe(403);
  });
});
