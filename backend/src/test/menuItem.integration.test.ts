import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Découvert en marge d'un autre chantier : PATCH/DELETE
// /api/menu-items/:id n'avaient jamais eu de test dédié, malgré un
// usage réel (désactivation d'un plat depuis MenuPage.tsx, modification
// du nom/catégorie/allergènes depuis RecipePage.tsx).
describe('Plats — modification et suppression', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant plats ${label}`,
        gerant: {
          email: `gerant-plats-${suffix}-${label}@test-foodcfo.local`,
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
    const email = `membre-plats-${suffix}-${label}@test-foodcfo.local`;
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${gerantToken}`)
      .send({ email, password: 'MotDePasseTest123!', firstName: 'Membre', lastName: label, role });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'MotDePasseTest123!' });
    return { accessToken: loginRes.body.accessToken as string };
  }

  async function createMenuItem(token: string, name = 'Plat test') {
    const res = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, category: 'Plats', sellingPriceTTC: 20, vatRate: 'TAUX_10' });
    return res.body.menuItem.id as string;
  }

  afterAll(async () => {
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('modifie le nom, la catégorie et les allergènes', async () => {
    const restaurant = await bootstrapRestaurant('A');
    const menuItemId = await createMenuItem(restaurant.accessToken);

    const res = await request(app)
      .patch(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ name: 'Plat renommé', category: 'Desserts', allergens: ['LAIT', 'GLUTEN'] });

    expect(res.status).toBe(200);
    expect(res.body.menuItem.name).toBe('Plat renommé');
    expect(res.body.menuItem.category).toBe('Desserts');
    expect(res.body.menuItem.allergens.sort()).toEqual(['GLUTEN', 'LAIT']);
  });

  it('désactive puis réactive un plat (isActive)', async () => {
    const restaurant = await bootstrapRestaurant('B');
    const menuItemId = await createMenuItem(restaurant.accessToken);

    const deactivateRes = await request(app)
      .patch(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.menuItem.isActive).toBe(false);

    const listRes = await request(app)
      .get('/api/menu-items')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    const listed = listRes.body.menuItems.find((m: { id: string }) => m.id === menuItemId);
    expect(listed.isActive).toBe(false);

    const reactivateRes = await request(app)
      .patch(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ isActive: true });
    expect(reactivateRes.body.menuItem.isActive).toBe(true);
  });

  it("isolation multi-tenant : impossible de modifier le plat d'un autre restaurant", async () => {
    const restaurantA = await bootstrapRestaurant('C');
    const restaurantB = await bootstrapRestaurant('D');
    const menuItemId = await createMenuItem(restaurantB.accessToken);

    const res = await request(app)
      .patch(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ name: 'Piraté' });

    expect(res.status).toBe(404);
  });

  it('supprime un plat', async () => {
    const restaurant = await bootstrapRestaurant('E');
    const menuItemId = await createMenuItem(restaurant.accessToken);

    const res = await request(app)
      .delete(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(res.status).toBe(204);

    const gone = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
    expect(gone).toBeNull();
  });

  it('un compte Cuisine peut modifier un plat mais pas le supprimer (réservé au Gérant)', async () => {
    const restaurant = await bootstrapRestaurant('F');
    const cuisine = await addTeamMember(restaurant.accessToken, 'F', 'CUISINE');
    const menuItemId = await createMenuItem(restaurant.accessToken);

    const updateRes = await request(app)
      .patch(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${cuisine.accessToken}`)
      .send({ name: 'Modifié par Cuisine' });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${cuisine.accessToken}`);
    expect(deleteRes.status).toBe(403);
  });

  it('un compte Service ne peut ni modifier ni supprimer un plat', async () => {
    const restaurant = await bootstrapRestaurant('G');
    const service = await addTeamMember(restaurant.accessToken, 'G', 'SERVICE');
    const menuItemId = await createMenuItem(restaurant.accessToken);

    const updateRes = await request(app)
      .patch(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${service.accessToken}`)
      .send({ name: 'Modifié par Service' });
    expect(updateRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${service.accessToken}`);
    expect(deleteRes.status).toBe(403);
  });
});
