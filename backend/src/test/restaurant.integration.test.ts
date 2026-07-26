import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// PATCH /api/restaurants/me — jusqu'ici, ni le nom ni le fuseau horaire
// du restaurant n'étaient modifiables après le bootstrap initial, alors
// que le fuseau a un effet réel sur les calculs "ce mois-ci" (voir
// lib/timezone.ts, suite 18). Volontairement pas de champ `currency` :
// jamais lu nulle part dans le code applicatif.
describe('Restaurant — modification des informations générales', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant infos ${label}`,
        gerant: {
          email: `gerant-infos-${suffix}-${label}@test-foodcfo.local`,
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

  it('renvoie le fuseau horaire dans GET /me (pas juste le nom et les seuils)', async () => {
    const restaurant = await bootstrapRestaurant('A');
    const res = await request(app)
      .get('/api/restaurants/me')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.restaurant.timezone).toBe('Europe/Paris');
  });

  it('modifie le nom et le fuseau horaire', async () => {
    const restaurant = await bootstrapRestaurant('B');

    const res = await request(app)
      .patch('/api/restaurants/me')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ name: 'Le Bistrot Renommé', timezone: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body.restaurant.name).toBe('Le Bistrot Renommé');
    expect(res.body.restaurant.timezone).toBe('America/New_York');

    const stillThere = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurant.user.restaurantId } });
    expect(stillThere.timezone).toBe('America/New_York');
  });

  it('refuse un fuseau horaire qui ne correspond à aucun identifiant IANA', async () => {
    const restaurant = await bootstrapRestaurant('C');

    const res = await request(app)
      .patch('/api/restaurants/me')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ timezone: 'Pas/UnVraiFuseau' });

    expect(res.status).toBe(400);
  });

  it('réservé au Gérant : un compte Cuisine ne peut pas modifier les informations du restaurant', async () => {
    const restaurant = await bootstrapRestaurant('D');
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({
        email: `cuisine-infos-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Cuisine',
        lastName: 'Test',
        role: 'CUISINE',
      });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: `cuisine-infos-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    const res = await request(app)
      .patch('/api/restaurants/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ name: 'Tentative Cuisine' });

    expect(res.status).toBe(403);
  });
});
