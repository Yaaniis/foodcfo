import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

describe('Acceptation des CGU à la création de compte', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it("refuse la création de compte si acceptTerms n'est pas exactement `true`", async () => {
    const base = {
      restaurantName: `Restaurant CGU refus ${suffix}`,
      gerant: {
        email: `gerant-cgu-refus-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Test',
        lastName: 'CGU',
      },
    };

    const missing = await request(app).post('/api/restaurants/bootstrap').send(base);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('VALIDATION_ERROR');

    const falseValue = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({ ...base, acceptTerms: false });
    expect(falseValue.status).toBe(400);

    // Aucun des deux essais refusés n'a dû créer de restaurant.
    const created = await prisma.restaurant.findFirst({ where: { name: base.restaurantName } });
    expect(created).toBeNull();
  });

  it('enregistre la date d’acceptation sur le compte Gérant quand acceptTerms est `true`', async () => {
    const email = `gerant-cgu-ok-${suffix}@test-foodcfo.local`;
    const before = new Date();

    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant CGU ok ${suffix}`,
        gerant: { email, password: 'MotDePasseTest123!', firstName: 'Test', lastName: 'CGU' },
        acceptTerms: true,
      });
    expect(res.status).toBe(201);
    createdRestaurantIds.push(res.body.user.restaurantId as string);

    const user = await prisma.user.findFirstOrThrow({ where: { email } });
    expect(user.termsAcceptedAt).not.toBeNull();
    expect(user.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
