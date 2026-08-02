import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

const MONDAY = '2026-08-03';

describe('Contrôle — documents et dossier par organisme', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant contrôle ${label}`,
        gerant: {
          email: `gerant-controle-${suffix}-${label}@test-foodcfo.local`,
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
    // Même contrainte que schedule/cleaningChecklist.integration.test.ts :
    // vider les tables Restrict-vers-User avant la cascade Restaurant → User.
    await prisma.schedule.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.cleaningChecklistCompletion.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('dépose un document, le liste (filtré ou non par organisme), sert le fichier, le supprime', async () => {
    const restaurant = await bootstrapRestaurant('A');

    const create = await request(app)
      .post('/api/control/documents')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .field('organism', 'URSSAF')
      .field('category', 'Registre du personnel')
      .field('label', 'Registre unique 2026')
      .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'registre.pdf');
    expect(create.status).toBe(201);
    expect(create.body.document).toMatchObject({ organism: 'URSSAF', category: 'Registre du personnel' });

    await request(app)
      .post('/api/control/documents')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .field('organism', 'DDPP')
      .field('category', 'PMS')
      .field('label', 'Plan de maîtrise sanitaire')
      .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'pms.pdf');

    const listAll = await request(app)
      .get('/api/control/documents')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(listAll.body.documents).toHaveLength(2);
    expect(JSON.stringify(listAll.body)).not.toContain('fileData');

    const listUrssaf = await request(app)
      .get('/api/control/documents?organism=URSSAF')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(listUrssaf.body.documents).toHaveLength(1);
    expect(listUrssaf.body.documents[0].organism).toBe('URSSAF');

    const file = await request(app)
      .get(`/api/control/documents/${create.body.document.id}/file`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');

    const del = await request(app)
      .delete(`/api/control/documents/${create.body.document.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(del.status).toBe(204);
  });

  it("rejette un fichier qui n'est ni PDF, ni JPG, ni PNG", async () => {
    const restaurant = await bootstrapRestaurant('B');
    const res = await request(app)
      .post('/api/control/documents')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .field('organism', 'DGCCRF')
      .field('category', 'Affichage prix')
      .field('label', 'Test')
      .attach('file', Buffer.from('<html>pas un document</html>'), 'fichier.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  it('dossier URSSAF : inclut le récapitulatif d\'heures du planning validé sur la période', async () => {
    const restaurant = await bootstrapRestaurant('C');
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({
        email: `service-controle-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Marc',
        lastName: 'Service',
        role: 'SERVICE',
      });
    await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ weekday: 'MONDAY', role: 'SERVICE', startTime: '11:00', endTime: '15:00', requiredCount: 1 });
    const generate = await request(app)
      .post('/api/planning/schedules/generate')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ periodStart: MONDAY, periodEnd: MONDAY });
    await request(app)
      .post(`/api/planning/schedules/${generate.body.schedule.id}/validate`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    const dossier = await request(app)
      .get(`/api/control/dossier/URSSAF?periodStart=${MONDAY}&periodEnd=${MONDAY}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(dossier.status).toBe(200);
    expect(dossier.body.hoursSummary).toEqual([{ firstName: 'Marc', lastName: 'Service', totalHours: '4.00' }]);
    expect(dossier.body.cleaningHistory).toBeUndefined();
  });

  it("dossier DDPP : inclut l'historique des checklists de nettoyage sur la période", async () => {
    const restaurant = await bootstrapRestaurant('D');
    const template = await request(app)
      .post('/api/hygiene/checklist-templates')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ name: 'Fin de service midi', items: ['Tâche'] });
    await request(app)
      .post('/api/hygiene/checklist-completions')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ templateId: template.body.template.id, serviceDate: MONDAY });

    const dossier = await request(app)
      .get(`/api/control/dossier/DDPP?periodStart=${MONDAY}&periodEnd=${MONDAY}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(dossier.status).toBe(200);
    expect(dossier.body.cleaningHistory).toHaveLength(1);
    expect(dossier.body.cleaningHistory[0].templateName).toBe('Fin de service midi');
    expect(dossier.body.hoursSummary).toBeUndefined();
  });

  it("dossier DGCCRF/DGFIP : ni récapitulatif d'heures ni historique de nettoyage (pas de donnée auto-tirée pertinente)", async () => {
    const restaurant = await bootstrapRestaurant('E');
    const dossier = await request(app)
      .get('/api/control/dossier/DGCCRF')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(dossier.status).toBe(200);
    expect(dossier.body.hoursSummary).toBeUndefined();
    expect(dossier.body.cleaningHistory).toBeUndefined();
    expect(dossier.body.documents).toEqual([]);
  });

  it('réservé au Gérant', async () => {
    const restaurant = await bootstrapRestaurant('F');
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({
        email: `cuisine-controle-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Cuisine',
        lastName: 'Test',
        role: 'CUISINE',
      });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `cuisine-controle-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    const res = await request(app)
      .get('/api/control/documents')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('isolation multi-tenant : un restaurant ne voit ni ne peut supprimer les documents d\'un autre', async () => {
    const restaurantA = await bootstrapRestaurant('G');
    const restaurantB = await bootstrapRestaurant('H');

    const created = await request(app)
      .post('/api/control/documents')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .field('organism', 'DGFIP')
      .field('category', 'Attestation NF525')
      .field('label', 'Attestation caisse')
      .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'attestation.pdf');

    const listB = await request(app)
      .get('/api/control/documents')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listB.body.documents).toHaveLength(0);

    const fileCrossTenant = await request(app)
      .get(`/api/control/documents/${created.body.document.id}/file`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(fileCrossTenant.status).toBe(404);

    const delCrossTenant = await request(app)
      .delete(`/api/control/documents/${created.body.document.id}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(delCrossTenant.status).toBe(404);
  });
});
