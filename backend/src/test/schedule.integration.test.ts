import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// Phase 7.2 — bout-en-bout : génération (DRAFT) → liste → détail →
// validation (VALIDATED), au-dessus des disponibilités et besoins de
// staffing déjà couverts par availability/staffingRequirement
// integration tests. 2026-08-03 est un lundi (vérifié empiriquement,
// voir scheduleGenerator.test.ts).
const MONDAY = '2026-08-03';
const TUESDAY = '2026-08-04';

describe('Planning — génération de planning', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant planning ${label}`,
        gerant: {
          email: `gerant-planning-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { id: string; restaurantId: string } };
  }

  async function addEmployee(accessToken: string, label: string, role: 'CUISINE' | 'SERVICE') {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: `employe-planning-${suffix}-${label}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: label,
        lastName: 'Test',
        role,
      });
    return res.body.user as { id: string };
  }

  afterAll(async () => {
    // Schedule → ShiftAssignment (cascade) doit être vidé avant que la
    // cascade Restaurant → User n'atteigne les User référencés par
    // ShiftAssignment.userId (onDelete: Restrict) — même contrainte que
    // deleteRestaurant (restaurant.controller.ts).
    await prisma.schedule.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('génère un planning DRAFT couvrant les besoins, en respectant une indisponibilité, puis le valide', async () => {
    const restaurant = await bootstrapRestaurant('A');
    const cuistot = await addEmployee(restaurant.accessToken, 'CuistotA', 'CUISINE');
    await addEmployee(restaurant.accessToken, 'CuistotIndispo', 'CUISINE');

    await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 });

    const generate = await request(app)
      .post('/api/planning/schedules/generate')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ periodStart: MONDAY, periodEnd: MONDAY });

    expect(generate.status).toBe(201);
    expect(generate.body.schedule.status).toBe('DRAFT');
    expect(generate.body.schedule.shiftAssignments).toHaveLength(1);
    expect(generate.body.schedule.shiftAssignments[0]).toMatchObject({
      role: 'CUISINE',
      date: MONDAY,
      startTime: '11:00',
      endTime: '15:00',
    });
    expect([cuistot.id]).toContain(generate.body.schedule.shiftAssignments[0].user.id);
    expect(generate.body.unmetRequirements).toHaveLength(0);

    const scheduleId = generate.body.schedule.id as string;

    const list = await request(app)
      .get('/api/planning/schedules')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.schedules.map((s: { id: string }) => s.id)).toContain(scheduleId);

    const detail = await request(app)
      .get(`/api/planning/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.schedule.status).toBe('DRAFT');
    expect(detail.body.schedule.validatedAt).toBeNull();

    const validate = await request(app)
      .post(`/api/planning/schedules/${scheduleId}/validate`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(validate.status).toBe(200);
    expect(validate.body.schedule.status).toBe('VALIDATED');
    expect(validate.body.schedule.validatedAt).not.toBeNull();
    expect(validate.body.schedule.validatedBy.id).toBe(restaurant.user.id);

    const revalidate = await request(app)
      .post(`/api/planning/schedules/${scheduleId}/validate`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(revalidate.status).toBe(409);
  });

  it('signale un besoin non couvert quand aucun employé éligible ne correspond', async () => {
    const restaurant = await bootstrapRestaurant('B');
    await addEmployee(restaurant.accessToken, 'ServiceB', 'SERVICE');

    await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ weekday: 'TUESDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 });

    const generate = await request(app)
      .post('/api/planning/schedules/generate')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ periodStart: TUESDAY, periodEnd: TUESDAY });

    expect(generate.status).toBe(201);
    expect(generate.body.schedule.shiftAssignments).toHaveLength(0);
    expect(generate.body.unmetRequirements).toEqual([
      { date: TUESDAY, role: 'CUISINE', startTime: '11:00', endTime: '15:00', missingCount: 1 },
    ]);
  });

  it('rejette une période invalide (fin avant début, ou plus de 31 jours)', async () => {
    const restaurant = await bootstrapRestaurant('C');

    const endBeforeStart = await request(app)
      .post('/api/planning/schedules/generate')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ periodStart: TUESDAY, periodEnd: MONDAY });
    expect(endBeforeStart.status).toBe(400);

    const tooLong = await request(app)
      .post('/api/planning/schedules/generate')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ periodStart: '2026-08-01', periodEnd: '2026-09-15' });
    expect(tooLong.status).toBe(400);
  });

  it('isolation multi-tenant : un restaurant ne voit ni ne peut valider les plannings d’un autre', async () => {
    const restaurantA = await bootstrapRestaurant('D');
    const restaurantB = await bootstrapRestaurant('E');
    await addEmployee(restaurantA.accessToken, 'CuistotD', 'CUISINE');

    await request(app)
      .post('/api/planning/staffing-requirements')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 });

    const generate = await request(app)
      .post('/api/planning/schedules/generate')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ periodStart: MONDAY, periodEnd: MONDAY });
    const scheduleId = generate.body.schedule.id as string;

    const detailCrossTenant = await request(app)
      .get(`/api/planning/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(detailCrossTenant.status).toBe(404);

    const listB = await request(app)
      .get('/api/planning/schedules')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listB.body.schedules).toHaveLength(0);

    const validateCrossTenant = await request(app)
      .post(`/api/planning/schedules/${scheduleId}/validate`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(validateCrossTenant.status).toBe(404);
  });

  it('réservé au Gérant', async () => {
    const restaurant = await bootstrapRestaurant('F');
    await addEmployee(restaurant.accessToken, 'CuistotF', 'CUISINE');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `employe-planning-${suffix}-CuistotF@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    const res = await request(app)
      .post('/api/planning/schedules/generate')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ periodStart: MONDAY, periodEnd: MONDAY });
    expect(res.status).toBe(403);
  });

  it(
    "consultation ouverte à toute l'équipe (décision du 03/08/2026), mais génération/validation toujours réservées au Gérant",
    async () => {
      const restaurant = await bootstrapRestaurant('G');
      await addEmployee(restaurant.accessToken, 'CuistotG', 'CUISINE');
      const cuisineLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: `employe-planning-${suffix}-CuistotG@test-foodcfo.local`, password: 'MotDePasseTest123!' });
      const cuisineToken = cuisineLogin.body.accessToken as string;

      await request(app)
        .post('/api/planning/staffing-requirements')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 });
      const generate = await request(app)
        .post('/api/planning/schedules/generate')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ periodStart: MONDAY, periodEnd: MONDAY });
      const scheduleId = generate.body.schedule.id as string;

      const list = await request(app)
        .get('/api/planning/schedules')
        .set('Authorization', `Bearer ${cuisineToken}`);
      expect(list.status).toBe(200);
      expect(list.body.schedules.map((s: { id: string }) => s.id)).toContain(scheduleId);

      const detail = await request(app)
        .get(`/api/planning/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${cuisineToken}`);
      expect(detail.status).toBe(200);

      const validate = await request(app)
        .post(`/api/planning/schedules/${scheduleId}/validate`)
        .set('Authorization', `Bearer ${cuisineToken}`);
      expect(validate.status).toBe(403);
    },
  );

  describe('ajustement après coup (retard, absence)', () => {
    async function generateValidatedSchedule(accessToken: string, employeeId: string) {
      await request(app)
        .post('/api/planning/staffing-requirements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 });
      const generate = await request(app)
        .post('/api/planning/schedules/generate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ periodStart: MONDAY, periodEnd: MONDAY });
      const scheduleId = generate.body.schedule.id as string;
      const shiftId = generate.body.schedule.shiftAssignments.find(
        (s: { user: { id: string } }) => s.user.id === employeeId,
      ).id as string;
      await request(app)
        .post(`/api/planning/schedules/${scheduleId}/validate`)
        .set('Authorization', `Bearer ${accessToken}`);
      return { scheduleId, shiftId };
    }

    it('corrige les heures effectives (retard) sur un planning validé', async () => {
      const restaurant = await bootstrapRestaurant('H');
      const cuistot = await addEmployee(restaurant.accessToken, 'CuistotH', 'CUISINE');
      const { scheduleId, shiftId } = await generateValidatedSchedule(restaurant.accessToken, cuistot.id);

      const res = await request(app)
        .patch(`/api/planning/schedules/${scheduleId}/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ actualStartTime: '11:15', actualEndTime: '15:00' });

      expect(res.status).toBe(200);
      const shift = res.body.schedule.shiftAssignments[0];
      expect(shift.actualStartTime).toBe('11:15');
      expect(shift.actualEndTime).toBe('15:00');
      expect(shift.wasManuallyAdjusted).toBe(true);
      expect(shift.isAbsent).toBe(false);
    });

    it('marque une absence avec motif', async () => {
      const restaurant = await bootstrapRestaurant('I');
      const cuistot = await addEmployee(restaurant.accessToken, 'CuistotI', 'CUISINE');
      const { scheduleId, shiftId } = await generateValidatedSchedule(restaurant.accessToken, cuistot.id);

      const res = await request(app)
        .patch(`/api/planning/schedules/${scheduleId}/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ isAbsent: true, absenceNote: 'Arrêt maladie' });

      expect(res.status).toBe(200);
      const shift = res.body.schedule.shiftAssignments[0];
      expect(shift.isAbsent).toBe(true);
      expect(shift.absenceNote).toBe('Arrêt maladie');
    });

    it('annule une correction précédente (remet à zéro)', async () => {
      const restaurant = await bootstrapRestaurant('J');
      const cuistot = await addEmployee(restaurant.accessToken, 'CuistotJ', 'CUISINE');
      const { scheduleId, shiftId } = await generateValidatedSchedule(restaurant.accessToken, cuistot.id);

      const adjust = await request(app)
        .patch(`/api/planning/schedules/${scheduleId}/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ isAbsent: true, absenceNote: 'Erreur de saisie' });
      expect(adjust.body.schedule.shiftAssignments[0].wasManuallyAdjusted).toBe(true);

      const undo = await request(app)
        .patch(`/api/planning/schedules/${scheduleId}/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ isAbsent: false, absenceNote: null, actualStartTime: null, actualEndTime: null });

      expect(undo.status).toBe(200);
      const shift = undo.body.schedule.shiftAssignments[0];
      expect(shift.isAbsent).toBe(false);
      expect(shift.absenceNote).toBeNull();
      expect(shift.actualStartTime).toBeNull();
      // Un "effacer" complet doit retirer le statut "ajusté" — sinon le tag
      // "(ajusté)" et le bouton "Effacer" restent affichés pour toujours.
      expect(shift.wasManuallyAdjusted).toBe(false);
    });

    it("refuse la correction tant que le planning n'est pas validé (DRAFT)", async () => {
      const restaurant = await bootstrapRestaurant('K');
      await addEmployee(restaurant.accessToken, 'CuistotK', 'CUISINE');
      await request(app)
        .post('/api/planning/staffing-requirements')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 });
      const generate = await request(app)
        .post('/api/planning/schedules/generate')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ periodStart: MONDAY, periodEnd: MONDAY });
      const scheduleId = generate.body.schedule.id as string;
      const shiftId = generate.body.schedule.shiftAssignments[0].id as string;

      const res = await request(app)
        .patch(`/api/planning/schedules/${scheduleId}/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ isAbsent: true });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SCHEDULE_NOT_VALIDATED');
    });

    it("rejette une seule des deux heures effectives, et une heure de fin avant l'heure de début", async () => {
      const restaurant = await bootstrapRestaurant('L');
      const cuistot = await addEmployee(restaurant.accessToken, 'CuistotL', 'CUISINE');
      const { scheduleId, shiftId } = await generateValidatedSchedule(restaurant.accessToken, cuistot.id);

      const onlyStart = await request(app)
        .patch(`/api/planning/schedules/${scheduleId}/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ actualStartTime: '11:00' });
      expect(onlyStart.status).toBe(400);

      const endBeforeStart = await request(app)
        .patch(`/api/planning/schedules/${scheduleId}/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ actualStartTime: '15:00', actualEndTime: '11:00' });
      expect(endBeforeStart.status).toBe(400);
    });

    it('isolation multi-tenant : un restaurant ne peut pas corriger un créneau d’un autre', async () => {
      const restaurantA = await bootstrapRestaurant('M');
      const restaurantB = await bootstrapRestaurant('N');
      const cuistot = await addEmployee(restaurantA.accessToken, 'CuistotM', 'CUISINE');
      const { scheduleId, shiftId } = await generateValidatedSchedule(restaurantA.accessToken, cuistot.id);

      const res = await request(app)
        .patch(`/api/planning/schedules/${scheduleId}/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${restaurantB.accessToken}`)
        .send({ isAbsent: true });
      expect(res.status).toBe(404);
    });

    it('réservé au Gérant', async () => {
      const restaurant = await bootstrapRestaurant('O');
      const cuistot = await addEmployee(restaurant.accessToken, 'CuistotO', 'CUISINE');
      const { scheduleId, shiftId } = await generateValidatedSchedule(restaurant.accessToken, cuistot.id);
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: `employe-planning-${suffix}-CuistotO@test-foodcfo.local`, password: 'MotDePasseTest123!' });

      const res = await request(app)
        .patch(`/api/planning/schedules/${scheduleId}/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ isAbsent: true });
      expect(res.status).toBe(403);
    });
  });
});
