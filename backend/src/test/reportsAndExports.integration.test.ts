import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Comme pour les factures (Phase 3) et les commandes (Phase 4),
// l'environnement de test n'a pas de vraie clé RESEND_API_KEY : l'envoi
// du rapport mensuel échoue donc systématiquement ici, ce qui permet de
// vérifier que les données du rapport sont quand même renvoyées
// (repli), plutôt que de planter.
describe('Rapports mensuels et exports comptables', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant rapport ${label}`,
        gerant: {
          email: `gerant-rapport-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  afterAll(async () => {
    await prisma.wasteEntry.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  describe('Aperçu et envoi du rapport mensuel', () => {
    it('renvoie un aperçu cohérent du rapport, y compris sans aucune donnée', async () => {
      const restaurant = await bootstrapRestaurant('A');
      const res = await request(app)
        .get('/api/reports/monthly/preview')
        .set('Authorization', `Bearer ${restaurant.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.restaurantName).toBe('Restaurant rapport A');
      expect(res.body.data.averageMarginRatio).toBeNull();
      expect(res.body.data.wasteTotal).toBe(0);
      expect(res.body.email.subject).toContain('Restaurant rapport A');
    });

    it("bascule sur un repli (données renvoyées quand même) quand l'envoi email échoue", async () => {
      const restaurant = await bootstrapRestaurant('B');
      const res = await request(app)
        .post('/api/reports/monthly/send')
        .set('Authorization', `Bearer ${restaurant.accessToken}`);

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('EMAIL_SEND_FAILED');
      expect(res.body.data.restaurantName).toBe('Restaurant rapport B');
      expect(res.body.email.text).toContain('Restaurant rapport B');
    });

    it('réservé au Gérant : un compte Cuisine ne peut pas y accéder', async () => {
      const restaurant = await bootstrapRestaurant('C');
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({
          email: `cuisine-rapport-${suffix}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Cuisine',
          lastName: 'Test',
          role: 'CUISINE',
        });
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: `cuisine-rapport-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

      const previewRes = await request(app)
        .get('/api/reports/monthly/preview')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`);
      expect(previewRes.status).toBe(403);
    });
  });

  describe('Export comptable des factures', () => {
    async function setupValidatedInvoice(token: string, priceHT: number) {
      const supplier = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Fournisseur Export', category: 'Boucherie', preferredChannel: 'EMAIL' });
      const product = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId: supplier.body.supplier.id, name: 'Filet de bœuf', unit: 'KG', currentPriceHT: priceHT });

      const uploadRes = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .field('supplierId', supplier.body.supplier.id)
        .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'facture.pdf');
      const invoiceId = uploadRes.body.invoice.id as string;

      await request(app)
        .post(`/api/invoices/${invoiceId}/lines`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rawLabel: 'Filet de bœuf', productId: product.body.product.id, quantity: 2, unitPriceHT: priceHT, totalPriceHT: priceHT * 2 });

      await request(app).post(`/api/invoices/${invoiceId}/validate`).set('Authorization', `Bearer ${token}`);
      return invoiceId;
    }

    it('exporte les lignes de factures validées du mois en cours, avec en-têtes et BOM UTF-8', async () => {
      const restaurant = await bootstrapRestaurant('D');
      await setupValidatedInvoice(restaurant.accessToken, 20);

      const res = await request(app)
        .get('/api/exports/invoices.csv')
        .set('Authorization', `Bearer ${restaurant.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text).toContain('Date;Fournisseur;Produit;Quantité;Unité;Prix unitaire HT (€);Total HT (€)');
      expect(text).toContain('Fournisseur Export');
      expect(text).toContain('Filet de bœuf');
      expect(text).toContain('40.00');
    });

    it("n'inclut pas les factures non validées (brouillon/erreur)", async () => {
      const restaurant = await bootstrapRestaurant('E');
      await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'facture.pdf');

      const res = await request(app)
        .get('/api/exports/invoices.csv')
        .set('Authorization', `Bearer ${restaurant.accessToken}`);

      const dataLines = res.text.split('\r\n').slice(1).filter(Boolean);
      expect(dataLines).toHaveLength(0);
    });

    it('isolation multi-tenant : un restaurant ne voit pas les factures exportées d\'un autre', async () => {
      const restaurantA = await bootstrapRestaurant('F');
      const restaurantB = await bootstrapRestaurant('G');
      await setupValidatedInvoice(restaurantA.accessToken, 15);

      const res = await request(app)
        .get('/api/exports/invoices.csv')
        .set('Authorization', `Bearer ${restaurantB.accessToken}`);

      const dataLines = res.text.split('\r\n').slice(1).filter(Boolean);
      expect(dataLines).toHaveLength(0);
    });

    it('réservé au Gérant : un compte Cuisine ne peut pas exporter', async () => {
      const restaurant = await bootstrapRestaurant('H');
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({
          email: `cuisine-export-${suffix}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Cuisine',
          lastName: 'Test',
          role: 'CUISINE',
        });
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: `cuisine-export-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

      const res = await request(app)
        .get('/api/exports/invoices.csv')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`);
      expect(res.status).toBe(403);
    });
  });
});
