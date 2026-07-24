import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Crée des restaurants indépendants via l'endpoint public de bootstrap,
// puis vérifie qu'aucun ne peut voir ou référencer les données d'un
// autre — c'est la garantie centrale du choix multi-tenant "invisible"
// (décision 0.1) : chaque requête doit être filtrée par le
// restaurantId du token, jamais par un identifiant fourni par le client.
describe('Isolation multi-tenant', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant test ${label}`,
        gerant: {
          email: `gerant-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  afterAll(async () => {
    // Les cascades définies dans schema.prisma (onDelete: Cascade sur
    // toutes les relations d'un Restaurant) suppriment automatiquement
    // tout ce qui a été créé pendant ces tests.
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it("un restaurant ne voit pas les plats créés par un autre restaurant", async () => {
    const restaurantA = await bootstrapRestaurant('A');
    const restaurantB = await bootstrapRestaurant('B');

    await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ name: 'Plat secret A', category: 'Plats', sellingPriceTTC: 10, vatRate: 'TAUX_10' });

    const listFromB = await request(app)
      .get('/api/menu-items')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);

    const names = (listFromB.body.menuItems as { name: string }[]).map((m) => m.name);
    expect(names).not.toContain('Plat secret A');
  });

  it("un restaurant ne voit pas les utilisateurs d'un autre restaurant", async () => {
    const restaurantA = await bootstrapRestaurant('C');
    const restaurantB = await bootstrapRestaurant('D');
    void restaurantA;

    const usersFromB = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);

    const emails = (usersFromB.body.users as { email: string }[]).map((u) => u.email);
    expect(emails).not.toContain(`gerant-${suffix}-C@test-foodcfo.local`);
  });

  it("il est impossible de créer une fiche technique en référençant le produit d'un autre restaurant", async () => {
    const restaurantA = await bootstrapRestaurant('E');
    const restaurantB = await bootstrapRestaurant('F');

    const supplierA = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ name: 'Fournisseur A', category: 'Test', preferredChannel: 'EMAIL' });

    const productA = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ supplierId: supplierA.body.supplier.id, name: 'Produit A', unit: 'KG', currentPriceHT: 5 });

    const menuItemB = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`)
      .send({ name: 'Plat B', category: 'Plats', sellingPriceTTC: 10, vatRate: 'TAUX_10' });

    const recipeRes = await request(app)
      .put(`/api/menu-items/${menuItemB.body.menuItem.id}/recipe`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`)
      .send({ ingredients: [{ productId: productA.body.product.id, quantity: 0.1 }] });

    expect(recipeRes.status).toBe(400);
  });
});
