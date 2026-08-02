import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Phase 7.2 — première brique du module Planning : les règles de
// disponibilité par employé, saisies avant que le générateur de
// planning existe (il en aura besoin comme donnée d'entrée).
describe('Planning — disponibilités des employés', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant dispo ${label}`,
        gerant: {
          email: `gerant-dispo-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  async function createEmployee(token: string, label: string, role: 'CUISINE' | 'SERVICE' = 'CUISINE') {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: `employe-dispo-${suffix}-${label}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: label,
        lastName: 'Test',
        role,
      });
    return res.body.user.id as string;
  }

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('crée une règle récurrente (jour de semaine) et une règle ponctuelle (date précise), les liste, les supprime', async () => {
    const restaurant = await bootstrapRestaurant('A');
    const employeeId = await createEmployee(restaurant.accessToken, 'Nicolas');

    const recurring = await request(app)
      .post('/api/planning/availabilities')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ userId: employeeId, weekday: 'WEDNESDAY', reason: 'Cours du soir' });
    expect(recurring.status).toBe(201);
    expect(recurring.body.availability.weekday).toBe('WEDNESDAY');
    expect(recurring.body.availability.user.firstName).toBe('Nicolas');

    const oneOff = await request(app)
      .post('/api/planning/availabilities')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ userId: employeeId, specificDate: '2026-08-15' });
    expect(oneOff.status).toBe(201);
    expect(oneOff.body.availability.specificDate).toContain('2026-08-15');

    const list = await request(app)
      .get('/api/planning/availabilities')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.availabilities).toHaveLength(2);

    const del = await request(app)
      .delete(`/api/planning/availabilities/${recurring.body.availability.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(del.status).toBe(204);

    const listAfterDelete = await request(app)
      .get('/api/planning/availabilities')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(listAfterDelete.body.availabilities).toHaveLength(1);
  });

  it('refuse à la fois weekday et specificDate ensemble, et refuse ni l’un ni l’autre', async () => {
    const restaurant = await bootstrapRestaurant('B');
    const employeeId = await createEmployee(restaurant.accessToken, 'Julie');

    const both = await request(app)
      .post('/api/planning/availabilities')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ userId: employeeId, weekday: 'MONDAY', specificDate: '2026-08-15' });
    expect(both.status).toBe(400);

    const neither = await request(app)
      .post('/api/planning/availabilities')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ userId: employeeId });
    expect(neither.status).toBe(400);
  });

  it('isolation multi-tenant : impossible de créer une règle pour un employé d’un autre restaurant, ni de voir/supprimer les règles d’un autre restaurant', async () => {
    const restaurantA = await bootstrapRestaurant('C');
    const restaurantB = await bootstrapRestaurant('D');
    const employeeA = await createEmployee(restaurantA.accessToken, 'EmployeA');

    // B ne peut pas créer de règle pour un employé de A.
    const crossTenant = await request(app)
      .post('/api/planning/availabilities')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`)
      .send({ userId: employeeA, weekday: 'FRIDAY' });
    expect(crossTenant.status).toBe(404);

    const ruleA = await request(app)
      .post('/api/planning/availabilities')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ userId: employeeA, weekday: 'FRIDAY' });

    // B ne voit pas les règles de A.
    const listB = await request(app)
      .get('/api/planning/availabilities')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listB.body.availabilities).toHaveLength(0);

    // B ne peut pas supprimer une règle de A.
    const delCrossTenant = await request(app)
      .delete(`/api/planning/availabilities/${ruleA.body.availability.id}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(delCrossTenant.status).toBe(404);
  });

  it('réservé au Gérant : Cuisine et Service n’ont pas accès au planning', async () => {
    const restaurant = await bootstrapRestaurant('E');
    await createEmployee(restaurant.accessToken, 'Cuistot', 'CUISINE');
    await createEmployee(restaurant.accessToken, 'Serveur', 'SERVICE');

    const cuisineLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `employe-dispo-${suffix}-Cuistot@test-foodcfo.local`, password: 'MotDePasseTest123!' });
    const serviceLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `employe-dispo-${suffix}-Serveur@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    for (const token of [cuisineLogin.body.accessToken, serviceLogin.body.accessToken]) {
      const res = await request(app).get('/api/planning/availabilities').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });
});
