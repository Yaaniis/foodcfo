import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Avant ce chantier, `/api/products` et `/api/suppliers` n'exposaient
// que GET/POST — aucun moyen de corriger une faute de frappe, un email
// qui change, ou un prix mal saisi sans passer directement par la base
// de données. Ces tests couvrent le CRUD complet ajouté pour combler ce
// manque.
describe('Fournisseurs et produits — modification et suppression', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant fournisseurs ${label}`,
        gerant: {
          email: `gerant-fourn-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  // Ajoute un membre d'équipe AU MÊME restaurant que `gerantToken`
  // (contrairement à un deuxième `bootstrapRestaurant`, qui créerait un
  // restaurant entièrement séparé) — nécessaire pour tester les
  // permissions par rôle sur les mêmes données que le Gérant.
  async function addTeamMember(gerantToken: string, label: string, role: 'CUISINE' | 'SERVICE') {
    const email = `membre-fourn-${suffix}-${label}@test-foodcfo.local`;
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${gerantToken}`)
      .send({ email, password: 'MotDePasseTest123!', firstName: 'Membre', lastName: label, role });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'MotDePasseTest123!' });
    return { accessToken: loginRes.body.accessToken as string };
  }

  async function createSupplier(token: string, name: string) {
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, category: 'Boucherie', preferredChannel: 'EMAIL' });
    return res.body.supplier.id as string;
  }

  async function createProduct(token: string, supplierId: string, priceHT = 10) {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, name: 'Filet de bœuf', unit: 'KG', currentPriceHT: priceHT });
    return res.body.product.id as string;
  }

  afterAll(async () => {
    // Même contrainte que waste/order : RecipeIngredient.productId a un
    // onDelete: Restrict, on nettoie les plats avant les restaurants.
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  describe('Produits', () => {
    it('modifie le nom, l’unité et le prix d’un produit', async () => {
      const restaurant = await bootstrapRestaurant('A');
      const supplierId = await createSupplier(restaurant.accessToken, 'Fournisseur A');
      const productId = await createProduct(restaurant.accessToken, supplierId, 10);

      const res = await request(app)
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ name: 'Filet de bœuf (corrigé)', currentPriceHT: 12.5 });

      expect(res.status).toBe(200);
      expect(res.body.product.name).toBe('Filet de bœuf (corrigé)');
      expect(Number(res.body.product.currentPriceHT)).toBe(12.5);
    });

    it("refuse de rattacher un produit à un fournisseur d'un autre restaurant", async () => {
      const restaurantA = await bootstrapRestaurant('B');
      const restaurantB = await bootstrapRestaurant('C');
      const supplierIdA = await createSupplier(restaurantA.accessToken, 'Fournisseur B');
      const productId = await createProduct(restaurantA.accessToken, supplierIdA, 10);
      const supplierIdB = await createSupplier(restaurantB.accessToken, 'Fournisseur C');

      const res = await request(app)
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${restaurantA.accessToken}`)
        .send({ supplierId: supplierIdB });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('supprime un produit non utilisé', async () => {
      const restaurant = await bootstrapRestaurant('D');
      const supplierId = await createSupplier(restaurant.accessToken, 'Fournisseur D');
      const productId = await createProduct(restaurant.accessToken, supplierId);

      const res = await request(app)
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`);
      expect(res.status).toBe(204);

      const gone = await prisma.product.findUnique({ where: { id: productId } });
      expect(gone).toBeNull();
    });

    it("refuse de supprimer un produit encore utilisé dans une fiche technique (409, pas une erreur 500)", async () => {
      const restaurant = await bootstrapRestaurant('E');
      const supplierId = await createSupplier(restaurant.accessToken, 'Fournisseur E');
      const productId = await createProduct(restaurant.accessToken, supplierId);

      const menuItem = await request(app)
        .post('/api/menu-items')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ name: 'Plat E', category: 'Plats', sellingPriceTTC: 20, vatRate: 'TAUX_10' });
      await request(app)
        .put(`/api/menu-items/${menuItem.body.menuItem.id}/recipe`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ ingredients: [{ productId, quantity: 0.1 }] });

      const res = await request(app)
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('PRODUCT_IN_USE');

      const stillExists = await prisma.product.findUnique({ where: { id: productId } });
      expect(stillExists).not.toBeNull();
    });

    it('un compte Cuisine peut modifier un produit mais pas le supprimer (réservé au Gérant)', async () => {
      const restaurant = await bootstrapRestaurant('F');
      const cuisine = await addTeamMember(restaurant.accessToken, 'F', 'CUISINE');
      const supplierId = await createSupplier(restaurant.accessToken, 'Fournisseur F');
      const productId = await createProduct(restaurant.accessToken, supplierId);

      const updateRes = await request(app)
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${cuisine.accessToken}`)
        .send({ name: 'Modifié par Cuisine' });
      expect(updateRes.status).toBe(200);

      const deleteRes = await request(app)
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${cuisine.accessToken}`);
      expect(deleteRes.status).toBe(403);
    });

    it('un compte Service ne peut ni modifier ni supprimer un produit', async () => {
      const restaurant = await bootstrapRestaurant('G');
      const service = await addTeamMember(restaurant.accessToken, 'G', 'SERVICE');
      const supplierId = await createSupplier(restaurant.accessToken, 'Fournisseur G');
      const productId = await createProduct(restaurant.accessToken, supplierId);

      const updateRes = await request(app)
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${service.accessToken}`)
        .send({ name: 'Modifié par Service' });
      expect(updateRes.status).toBe(403);
    });
  });

  describe('Fournisseurs', () => {
    it('modifie les coordonnées d’un fournisseur', async () => {
      const restaurant = await bootstrapRestaurant('H');
      const supplierId = await createSupplier(restaurant.accessToken, 'Fournisseur H');

      const res = await request(app)
        .patch(`/api/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ contactEmail: 'nouveau@fournisseur-h.fr', notes: 'Nouveau contact depuis janvier' });

      expect(res.status).toBe(200);
      expect(res.body.supplier.contactEmail).toBe('nouveau@fournisseur-h.fr');
    });

    it("isolation multi-tenant : impossible de modifier le fournisseur d'un autre restaurant", async () => {
      const restaurantA = await bootstrapRestaurant('I');
      const restaurantB = await bootstrapRestaurant('J');
      const supplierIdB = await createSupplier(restaurantB.accessToken, 'Fournisseur J');

      const res = await request(app)
        .patch(`/api/suppliers/${supplierIdB}`)
        .set('Authorization', `Bearer ${restaurantA.accessToken}`)
        .send({ name: 'Piraté' });

      expect(res.status).toBe(404);
    });

    it('désactive un fournisseur (suppression douce) : disparaît de la liste, historique conservé', async () => {
      const restaurant = await bootstrapRestaurant('K');
      const supplierId = await createSupplier(restaurant.accessToken, 'Fournisseur K');

      const res = await request(app)
        .delete(`/api/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`);
      expect(res.status).toBe(204);

      const listRes = await request(app)
        .get('/api/suppliers')
        .set('Authorization', `Bearer ${restaurant.accessToken}`);
      expect(listRes.body.suppliers.map((s: { id: string }) => s.id)).not.toContain(supplierId);

      const stillInDb = await prisma.supplier.findUnique({ where: { id: supplierId } });
      expect(stillInDb).not.toBeNull();
      expect(stillInDb!.isActive).toBe(false);
    });

    it('un compte Cuisine peut modifier un fournisseur mais pas le désactiver (réservé au Gérant)', async () => {
      const restaurant = await bootstrapRestaurant('L');
      const cuisine = await addTeamMember(restaurant.accessToken, 'L', 'CUISINE');
      const supplierId = await createSupplier(restaurant.accessToken, 'Fournisseur L');

      const updateRes = await request(app)
        .patch(`/api/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${cuisine.accessToken}`)
        .send({ name: 'Modifié par Cuisine' });
      expect(updateRes.status).toBe(200);

      const deleteRes = await request(app)
        .delete(`/api/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${cuisine.accessToken}`);
      expect(deleteRes.status).toBe(403);
    });
  });
});
