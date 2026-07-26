import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Découvert en marge d'un autre chantier : PATCH /api/users/:id
// n'avait jamais eu de test dédié, et rien n'empêchait de désactiver
// ou rétrograder le dernier Gérant actif d'un restaurant — ce qui
// aurait bloqué définitivement l'accès à la gestion de l'équipe, la
// facturation et les données RGPD.
describe('Utilisateurs — modification et garde-fou du dernier Gérant', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant équipe ${label}`,
        gerant: {
          email: `gerant-equipe-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { id: string; restaurantId: string } };
  }

  async function addTeamMember(gerantToken: string, label: string, role: 'GERANT' | 'CUISINE' | 'SERVICE') {
    const email = `membre-equipe-${suffix}-${label}@test-foodcfo.local`;
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${gerantToken}`)
      .send({ email, password: 'MotDePasseTest123!', firstName: 'Membre', lastName: label, role });
    return res.body.user.id as string;
  }

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('modifie le prénom, le nom et le rôle d’un membre', async () => {
    const restaurant = await bootstrapRestaurant('A');
    const memberId = await addTeamMember(restaurant.accessToken, 'A', 'SERVICE');

    const res = await request(app)
      .patch(`/api/users/${memberId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ firstName: 'Nouveau', lastName: 'Nom', role: 'CUISINE' });

    expect(res.status).toBe(200);
    expect(res.body.user.firstName).toBe('Nouveau');
    expect(res.body.user.lastName).toBe('Nom');
    expect(res.body.user.role).toBe('CUISINE');
  });

  it("refuse de désactiver le seul Gérant du restaurant (y compris lui-même)", async () => {
    const restaurant = await bootstrapRestaurant('B');

    const res = await request(app)
      .patch(`/api/users/${restaurant.user.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('LAST_GERANT');

    const stillActive = await prisma.user.findUniqueOrThrow({ where: { id: restaurant.user.id } });
    expect(stillActive.isActive).toBe(true);
  });

  it('refuse de rétrograder le seul Gérant du restaurant vers un autre rôle', async () => {
    const restaurant = await bootstrapRestaurant('C');

    const res = await request(app)
      .patch(`/api/users/${restaurant.user.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ role: 'CUISINE' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('LAST_GERANT');
  });

  it('autorise la désactivation d’un Gérant tant qu’un autre Gérant actif reste dans le restaurant', async () => {
    const restaurant = await bootstrapRestaurant('D');
    const secondGerantId = await addTeamMember(restaurant.accessToken, 'D', 'GERANT');

    const res = await request(app)
      .patch(`/api/users/${restaurant.user.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(false);

    // Vérifie que le second Gérant, lui, reste bien actif et unique
    // recours restant — pas juste que la première désactivation ait techniquement réussi.
    const secondGerant = await prisma.user.findUniqueOrThrow({ where: { id: secondGerantId } });
    expect(secondGerant.isActive).toBe(true);
  });

  it("le garde-fou ne s'applique pas à un Gérant déjà inactif ou à un membre non-Gérant", async () => {
    const restaurant = await bootstrapRestaurant('E');
    const serviceId = await addTeamMember(restaurant.accessToken, 'E', 'SERVICE');

    const res = await request(app)
      .patch(`/api/users/${serviceId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(false);
  });

  it("isolation multi-tenant : impossible de modifier un utilisateur d'un autre restaurant", async () => {
    const restaurantA = await bootstrapRestaurant('F');
    const restaurantB = await bootstrapRestaurant('G');
    const memberId = await addTeamMember(restaurantB.accessToken, 'G', 'SERVICE');

    const res = await request(app)
      .patch(`/api/users/${memberId}`)
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ firstName: 'Piraté' });

    expect(res.status).toBe(404);
  });
});
