import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Opération irréversible : ces tests couvrent volontairement un
// maximum de cas, y compris un scénario de suppression avec des
// données dans TOUTES les tables sensibles aux contraintes Restrict
// (RecipeIngredient/OrderLineItem → Product, WasteEntry → User, et
// depuis la Phase 7 : ShiftAssignment/CleaningChecklistCompletion/
// ControlDocument → User) — c'est exactement le cas qui avait cassé le
// nettoyage des tests des Phases 4 et 5 avant correction, puis à nouveau
// celui de schedule.integration.test.ts lors de l'ajout de la Phase 7
// (voir FoodCFO_JOURNAL.md), donc le cas le plus important à valider ici.
describe('RGPD — export et suppression des données sur demande', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant RGPD ${label}`,
        gerant: {
          email: `gerant-rgpd-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { id: string; restaurantId: string } };
  }

  afterAll(async () => {
    // Les restaurants réellement supprimés par les tests eux-mêmes ne
    // sont plus dans cette liste au moment du nettoyage (ils n'existent
    // déjà plus) — deleteMany sur un id absent ne fait simplement rien.
    await prisma.wasteEntry.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  describe('Export', () => {
    it('exporte les données du restaurant sans jamais inclure de mot de passe', async () => {
      const restaurant = await bootstrapRestaurant('A');
      const res = await request(app)
        .get('/api/restaurants/me/export')
        .set('Authorization', `Bearer ${restaurant.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.restaurant.name).toBe('Restaurant RGPD A');
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].email).toContain('gerant-rgpd');
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain('tokenHash');
    });

    it('réservé au Gérant : un compte Cuisine ne peut pas exporter', async () => {
      const restaurant = await bootstrapRestaurant('B');
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({
          email: `cuisine-rgpd-${suffix}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Cuisine',
          lastName: 'Test',
          role: 'CUISINE',
        });
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: `cuisine-rgpd-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

      const res = await request(app)
        .get('/api/restaurants/me/export')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Suppression', () => {
    it('refuse la suppression si le nom saisi ne correspond pas exactement', async () => {
      const restaurant = await bootstrapRestaurant('C');
      const res = await request(app)
        .delete('/api/restaurants/me')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ confirmRestaurantName: 'mauvais nom' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('CONFIRMATION_MISMATCH');

      const stillExists = await prisma.restaurant.findUnique({ where: { id: restaurant.user.restaurantId } });
      expect(stillExists).not.toBeNull();
    });

    it('supprime intégralement un restaurant avec des données dans toutes les tables sensibles (Order, MenuItem+Recipe, WasteEntry, Invoice, Schedule/ShiftAssignment, CleaningChecklistCompletion, ControlDocument) sans violation de contrainte', async () => {
      const restaurant = await bootstrapRestaurant('D');
      const token = restaurant.accessToken;

      const supplier = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Fournisseur RGPD', category: 'Boucherie', preferredChannel: 'EMAIL' });
      const product = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierId: supplier.body.supplier.id, name: 'Produit RGPD', unit: 'KG', currentPriceHT: 10 });
      const productId = product.body.product.id as string;

      // Un plat avec fiche technique (RecipeIngredient → Product).
      const menuItem = await request(app)
        .post('/api/menu-items')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Plat RGPD', category: 'Plats', sellingPriceTTC: 20, vatRate: 'TAUX_10' });
      await request(app)
        .put(`/api/menu-items/${menuItem.body.menuItem.id}/recipe`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ingredients: [{ productId, quantity: 0.1 }] });

      // Une commande (OrderLineItem → Product).
      await request(app)
        .post('/api/orders/from-cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ productId, quantity: 5 }] });

      // Une perte déclarée (WasteEntry.declaredBy → User).
      await request(app)
        .post('/api/waste')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId, quantity: 1, reason: 'PERIME' });

      // Une facture validée (Invoice/InvoiceLineItem + PriceHistory).
      const uploadRes = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .field('supplierId', supplier.body.supplier.id)
        .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'facture.pdf');
      await request(app)
        .post(`/api/invoices/${uploadRes.body.invoice.id}/lines`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rawLabel: 'Produit RGPD', productId, quantity: 1, unitPriceHT: 10, totalPriceHT: 10 });
      await request(app).post(`/api/invoices/${uploadRes.body.invoice.id}/validate`).set('Authorization', `Bearer ${token}`);

      // Un planning généré avec un créneau affecté (Schedule →
      // ShiftAssignment.userId → User, Restrict) — créé directement en
      // base plutôt que via /api/planning/schedules/generate pour ne
      // pas dépendre de l'alignement jour de semaine/date ici, seule la
      // présence de la ligne ShiftAssignment important pour ce test.
      const schedule = await prisma.schedule.create({
        data: {
          restaurantId: restaurant.user.restaurantId,
          periodStart: new Date('2026-08-03T00:00:00.000Z'),
          periodEnd: new Date('2026-08-03T00:00:00.000Z'),
          shiftAssignments: {
            create: [
              {
                userId: restaurant.user.id,
                role: 'GERANT',
                date: new Date('2026-08-03T00:00:00.000Z'),
                startTime: new Date(Date.UTC(1970, 0, 1, 11, 0)),
                endTime: new Date(Date.UTC(1970, 0, 1, 15, 0)),
              },
            ],
          },
        },
      });

      // Une checklist de fin de service complétée
      // (CleaningChecklistCompletion.completedById → User, Restrict).
      const template = await prisma.cleaningChecklistTemplate.create({
        data: {
          restaurantId: restaurant.user.restaurantId,
          name: 'Fin de service midi',
          items: { create: [{ label: 'Nettoyer le plan de travail', order: 1 }] },
        },
        include: { items: true },
      });
      await prisma.cleaningChecklistCompletion.create({
        data: {
          restaurantId: restaurant.user.restaurantId,
          templateId: template.id,
          serviceDate: new Date('2026-08-03T00:00:00.000Z'),
          completedById: restaurant.user.id,
          items: { create: [{ templateItemId: template.items[0].id, isChecked: true, checkedAt: new Date() }] },
        },
      });

      // Un document déposé pour un contrôle
      // (ControlDocument.uploadedById → User, Restrict).
      await prisma.controlDocument.create({
        data: {
          restaurantId: restaurant.user.restaurantId,
          organism: 'URSSAF',
          category: 'Registre du personnel',
          label: 'Document RGPD',
          fileData: Buffer.from('contenu factice'),
          fileMimeType: 'application/pdf',
          uploadedById: restaurant.user.id,
        },
      });

      const deleteRes = await request(app)
        .delete('/api/restaurants/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirmRestaurantName: 'Restaurant RGPD D' });

      expect(deleteRes.status).toBe(204);

      const gone = await prisma.restaurant.findUnique({ where: { id: restaurant.user.restaurantId } });
      expect(gone).toBeNull();
      const productGone = await prisma.product.findUnique({ where: { id: productId } });
      expect(productGone).toBeNull();
      const supplierGone = await prisma.supplier.findUnique({ where: { id: supplier.body.supplier.id } });
      expect(supplierGone).toBeNull();
      const scheduleGone = await prisma.schedule.findUnique({ where: { id: schedule.id } });
      expect(scheduleGone).toBeNull();
      const templateGone = await prisma.cleaningChecklistTemplate.findUnique({ where: { id: template.id } });
      expect(templateGone).toBeNull();
    });

    it('réservé au Gérant : un compte Cuisine ne peut pas supprimer le restaurant', async () => {
      const restaurant = await bootstrapRestaurant('E');
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({
          email: `cuisine-rgpd-del-${suffix}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Cuisine',
          lastName: 'Test',
          role: 'CUISINE',
        });
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: `cuisine-rgpd-del-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

      const res = await request(app)
        .delete('/api/restaurants/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .send({ confirmRestaurantName: 'Restaurant RGPD E' });
      expect(res.status).toBe(403);

      const stillExists = await prisma.restaurant.findUnique({ where: { id: restaurant.user.restaurantId } });
      expect(stillExists).not.toBeNull();
    });

    it("n'est pas bloquée par un ancien identifiant d'abonnement Stripe quand la facturation n'est pas configurée (cet environnement)", async () => {
      // Sans vraie clé Stripe (`isBillingConfigured === false`), la
      // tentative de résiliation est court-circuitée avant tout appel
      // réseau — ce test verrouille ce comportement pour l'état actuel
      // de l'environnement, distinct du scénario "facturation active"
      // couvert unitairement par `needsStripeCancellation` (billing.controller.test.ts).
      const restaurant = await bootstrapRestaurant('H');
      await prisma.restaurant.update({
        where: { id: restaurant.user.restaurantId },
        data: { stripeSubscriptionId: 'sub_fake_not_configured' },
      });

      const res = await request(app)
        .delete('/api/restaurants/me')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ confirmRestaurantName: 'Restaurant RGPD H' });

      expect(res.status).toBe(204);
      const gone = await prisma.restaurant.findUnique({ where: { id: restaurant.user.restaurantId } });
      expect(gone).toBeNull();
    });

    it("isolation multi-tenant : supprimer un restaurant n'affecte pas les données d'un autre", async () => {
      const restaurantA = await bootstrapRestaurant('F');
      const restaurantB = await bootstrapRestaurant('G');

      await request(app)
        .delete('/api/restaurants/me')
        .set('Authorization', `Bearer ${restaurantA.accessToken}`)
        .send({ confirmRestaurantName: 'Restaurant RGPD F' });

      const bStillExists = await prisma.restaurant.findUnique({ where: { id: restaurantB.user.restaurantId } });
      expect(bStillExists).not.toBeNull();
    });
  });
});
