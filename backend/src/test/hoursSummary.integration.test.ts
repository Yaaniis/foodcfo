import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Phase 7.2 — dernier morceau du module Planning : le récapitulatif
// d'heures exportable pour le comptable, construit au-dessus d'un
// planning déjà généré et validé (schedule.integration.test.ts couvre
// déjà la génération elle-même). 2026-08-03 est un lundi, 2026-08-09
// un dimanche (mêmes dates vérifiées empiriquement que
// scheduleGenerator.test.ts).
const MONDAY = '2026-08-03';
const SUNDAY = '2026-08-09';

describe('Planning — récapitulatif d\'heures (export CSV)', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant heures ${label}`,
        gerant: {
          email: `gerant-heures-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { id: string; restaurantId: string } };
  }

  async function addEmployee(accessToken: string, label: string) {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: `employe-heures-${suffix}-${label}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: label,
        lastName: 'Nom',
        role: 'SERVICE',
      });
    return res.body.user as { id: string };
  }

  async function generateAndValidate(
    accessToken: string,
    weekday: string,
    date: string,
    startTime: string,
    endTime: string,
  ) {
    await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ weekday, role: 'SERVICE', startTime, endTime, requiredCount: 1 });

    const generate = await request(app)
      .post('/api/planning/schedules/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ periodStart: date, periodEnd: date });
    const scheduleId = generate.body.schedule.id as string;

    await request(app).post(`/api/planning/schedules/${scheduleId}/validate`).set('Authorization', `Bearer ${accessToken}`);
    return scheduleId;
  }

  afterAll(async () => {
    // Même contrainte que schedule.integration.test.ts : vider Schedule
    // (cascade → ShiftAssignment) avant que la cascade Restaurant → User
    // n'atteigne les User référencés en onDelete: Restrict.
    await prisma.schedule.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('exporte le récapitulatif du planning validé, avec en-têtes et BOM UTF-8', async () => {
    const restaurant = await bootstrapRestaurant('A');
    await addEmployee(restaurant.accessToken, 'ServiceA');
    await generateAndValidate(restaurant.accessToken, 'MONDAY', MONDAY, '11:00', '18:00'); // 7h

    const res = await request(app)
      .get(`/api/planning/hours-summary.csv?periodStart=${MONDAY}&periodEnd=${MONDAY}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('Nom;Prénom;Heures totales;Heures normales;Heures supplémentaires;Heures dimanche;Heures jours fériés');
    expect(text).toContain('Nom;ServiceA;7.00;7.00;0.00;0.00;0.00');
  });

  it("n'inclut pas les heures d'un planning encore en brouillon (DRAFT)", async () => {
    const restaurant = await bootstrapRestaurant('B');
    await addEmployee(restaurant.accessToken, 'ServiceB');
    await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ weekday: 'MONDAY', role: 'SERVICE', startTime: '11:00', endTime: '15:00', requiredCount: 1 });
    // Généré mais jamais validé — ne doit pas apparaître dans l'export.
    await request(app)
      .post('/api/planning/schedules/generate')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ periodStart: MONDAY, periodEnd: MONDAY });

    const res = await request(app)
      .get(`/api/planning/hours-summary.csv?periodStart=${MONDAY}&periodEnd=${MONDAY}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    const dataLines = res.text.split('\r\n').slice(1).filter(Boolean);
    expect(dataLines).toHaveLength(0);
  });

  it('étiquette les heures travaillées un dimanche', async () => {
    const restaurant = await bootstrapRestaurant('C');
    await addEmployee(restaurant.accessToken, 'ServiceC');
    await generateAndValidate(restaurant.accessToken, 'SUNDAY', SUNDAY, '11:00', '15:00'); // 4h, un dimanche

    const res = await request(app)
      .get(`/api/planning/hours-summary.csv?periodStart=${SUNDAY}&periodEnd=${SUNDAY}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(res.text).toContain('Nom;ServiceC;4.00;4.00;0.00;4.00;0.00');
  });

  it("isolation multi-tenant : un restaurant ne voit pas le récapitulatif d'un autre", async () => {
    const restaurantA = await bootstrapRestaurant('D');
    const restaurantB = await bootstrapRestaurant('E');
    await addEmployee(restaurantA.accessToken, 'ServiceD');
    await generateAndValidate(restaurantA.accessToken, 'MONDAY', MONDAY, '11:00', '15:00');

    const res = await request(app)
      .get(`/api/planning/hours-summary.csv?periodStart=${MONDAY}&periodEnd=${MONDAY}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);

    const dataLines = res.text.split('\r\n').slice(1).filter(Boolean);
    expect(dataLines).toHaveLength(0);
  });

  it('réservé au Gérant', async () => {
    const restaurant = await bootstrapRestaurant('F');
    await addEmployee(restaurant.accessToken, 'ServiceF');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `employe-heures-${suffix}-ServiceF@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    const res = await request(app)
      .get('/api/planning/hours-summary.csv')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });
});
