import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Phase 7.2 — deuxième et dernière donnée d'entrée nécessaire avant
// l'algorithme de génération du planning (avec les disponibilités,
// voir availability.integration.test.ts).
describe('Planning — besoins de staffing', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant besoins ${label}`,
        gerant: {
          email: `gerant-besoins-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('crée un besoin, le liste avec les heures au format HH:mm, le supprime', async () => {
    const restaurant = await bootstrapRestaurant('A');

    const create = await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ weekday: 'MONDAY', role: 'CUISINE', startTime: '11:30', endTime: '15:00', requiredCount: 2 });
    expect(create.status).toBe(201);
    expect(create.body.staffingRequirement).toMatchObject({
      weekday: 'MONDAY',
      role: 'CUISINE',
      startTime: '11:30',
      endTime: '15:00',
      requiredCount: 2,
    });

    const list = await request(app)
      .get('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.staffingRequirements).toHaveLength(1);
    expect(list.body.staffingRequirements[0].startTime).toBe('11:30');

    const del = await request(app)
      .delete(`/api/planning/staffing-requirements/${create.body.staffingRequirement.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app)
      .get('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(listAfter.body.staffingRequirements).toHaveLength(0);
  });

  it('rejette une heure de fin avant ou égale à l’heure de début, et un format d’heure invalide', async () => {
    const restaurant = await bootstrapRestaurant('B');

    const endBeforeStart = await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ weekday: 'TUESDAY', role: 'SERVICE', startTime: '15:00', endTime: '11:00', requiredCount: 1 });
    expect(endBeforeStart.status).toBe(400);

    const badFormat = await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ weekday: 'TUESDAY', role: 'SERVICE', startTime: '11h00', endTime: '15:00', requiredCount: 1 });
    expect(badFormat.status).toBe(400);
  });

  it('isolation multi-tenant : un restaurant ne voit ni ne peut supprimer les besoins d’un autre', async () => {
    const restaurantA = await bootstrapRestaurant('C');
    const restaurantB = await bootstrapRestaurant('D');

    const created = await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ weekday: 'FRIDAY', role: 'SERVICE', startTime: '18:00', endTime: '23:00', requiredCount: 3 });

    const listB = await request(app)
      .get('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listB.body.staffingRequirements).toHaveLength(0);

    const delCrossTenant = await request(app)
      .delete(`/api/planning/staffing-requirements/${created.body.staffingRequirement.id}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(delCrossTenant.status).toBe(404);
  });

  it('réservé au Gérant', async () => {
    const restaurant = await bootstrapRestaurant('E');
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({
        email: `employe-besoins-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Cuistot',
        lastName: 'Test',
        role: 'CUISINE',
      });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `employe-besoins-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    const res = await request(app)
      .get('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });
});
