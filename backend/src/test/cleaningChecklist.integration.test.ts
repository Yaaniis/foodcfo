import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

describe('Hygiène — checklist de fin de service', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant checklist ${label}`,
        gerant: {
          email: `gerant-checklist-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { id: string; restaurantId: string } };
  }

  async function addServiceEmployee(accessToken: string, label: string) {
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: `service-checklist-${suffix}-${label}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: label,
        lastName: 'Test',
        role: 'SERVICE',
      });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `service-checklist-${suffix}-${label}@test-foodcfo.local`, password: 'MotDePasseTest123!' });
    return login.body.accessToken as string;
  }

  afterAll(async () => {
    // CleaningChecklistCompletion.completedById → User est en
    // onDelete: Restrict (comme ShiftAssignment.userId, Phase 7.2) : à
    // vider avant que la cascade Restaurant → User n'atteigne les User
    // référencés — voir deleteRestaurant (restaurant.controller.ts) qui
    // applique déjà ce même correctif pour la vraie suppression RGPD.
    await prisma.cleaningChecklistCompletion.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('crée un modèle (Gérant), le liste avec ses items ordonnés, le désactive', async () => {
    const restaurant = await bootstrapRestaurant('A');

    const create = await request(app)
      .post('/api/hygiene/checklist-templates')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ name: 'Fin de service midi', items: ['Nettoyer le plan de travail', 'Vider les poubelles', 'Ranger la chambre froide'] });
    expect(create.status).toBe(201);
    expect(create.body.template.items.map((i: { label: string }) => i.label)).toEqual([
      'Nettoyer le plan de travail',
      'Vider les poubelles',
      'Ranger la chambre froide',
    ]);

    const list = await request(app)
      .get('/api/hygiene/checklist-templates')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(list.body.templates).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/hygiene/checklist-templates/${create.body.template.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app)
      .get('/api/hygiene/checklist-templates')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(listAfter.body.templates).toHaveLength(0);
  });

  it("un membre Service peut démarrer et cocher une checklist, complétée seulement quand tout est coché", async () => {
    const restaurant = await bootstrapRestaurant('B');
    const serviceToken = await addServiceEmployee(restaurant.accessToken, 'B');

    const template = await request(app)
      .post('/api/hygiene/checklist-templates')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ name: 'Fin de service soir', items: ['Tâche 1', 'Tâche 2'] });
    const templateId = template.body.template.id as string;

    const completion = await request(app)
      .post('/api/hygiene/checklist-completions')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ templateId, serviceDate: '2026-08-03' });
    expect(completion.status).toBe(201);
    expect(completion.body.completion.completedAt).toBeNull();
    expect(completion.body.completion.items).toHaveLength(2);
    const completionId = completion.body.completion.id as string;
    // Les items de la complétion (CleaningChecklistCompletionItem) ont
    // leur propre id, distinct de celui des items du modèle
    // (CleaningChecklistTemplateItem) — c'est bien le premier que la
    // route PATCH .../items/:itemId attend.
    const [item1, item2] = completion.body.completion.items as { id: string }[];

    const checkFirst = await request(app)
      .patch(`/api/hygiene/checklist-completions/${completionId}/items/${item1.id}`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ isChecked: true });
    expect(checkFirst.status).toBe(200);
    expect(checkFirst.body.completion.completedAt).toBeNull(); // un seul des deux coché

    const checkSecond = await request(app)
      .patch(`/api/hygiene/checklist-completions/${completionId}/items/${item2.id}`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ isChecked: true });
    expect(checkSecond.status).toBe(200);
    expect(checkSecond.body.completion.completedAt).not.toBeNull(); // tout coché

    const uncheckFirst = await request(app)
      .patch(`/api/hygiene/checklist-completions/${completionId}/items/${item1.id}`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ isChecked: false });
    expect(uncheckFirst.body.completion.completedAt).toBeNull(); // redevient incomplète
  });

  it("refuse de démarrer une checklist sur un modèle désactivé", async () => {
    const restaurant = await bootstrapRestaurant('C');
    const template = await request(app)
      .post('/api/hygiene/checklist-templates')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ name: 'À désactiver', items: ['Tâche'] });
    await request(app)
      .delete(`/api/hygiene/checklist-templates/${template.body.template.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    const completion = await request(app)
      .post('/api/hygiene/checklist-completions')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ templateId: template.body.template.id, serviceDate: '2026-08-03' });
    expect(completion.status).toBe(404);
  });

  it('réservé au Gérant : créer/supprimer un modèle', async () => {
    const restaurant = await bootstrapRestaurant('D');
    const serviceToken = await addServiceEmployee(restaurant.accessToken, 'D');

    const create = await request(app)
      .post('/api/hygiene/checklist-templates')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ name: 'Test', items: ['Tâche'] });
    expect(create.status).toBe(403);
  });

  it("isolation multi-tenant : un restaurant ne voit ni ne peut démarrer/cocher les checklists d'un autre", async () => {
    const restaurantA = await bootstrapRestaurant('E');
    const restaurantB = await bootstrapRestaurant('F');

    const template = await request(app)
      .post('/api/hygiene/checklist-templates')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ name: 'Modèle A', items: ['Tâche'] });

    const crossTenantCompletion = await request(app)
      .post('/api/hygiene/checklist-completions')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`)
      .send({ templateId: template.body.template.id, serviceDate: '2026-08-03' });
    expect(crossTenantCompletion.status).toBe(404);

    const completionA = await request(app)
      .post('/api/hygiene/checklist-completions')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ templateId: template.body.template.id, serviceDate: '2026-08-03' });

    const listB = await request(app)
      .get('/api/hygiene/checklist-completions')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listB.body.completions).toHaveLength(0);

    const itemId = completionA.body.completion.items[0].id as string;
    const crossTenantToggle = await request(app)
      .patch(`/api/hygiene/checklist-completions/${completionA.body.completion.id}/items/${itemId}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`)
      .send({ isChecked: true });
    expect(crossTenantToggle.status).toBe(404);
  });
});
