import { describe, it, expect } from 'vitest';
import { generateSchedule } from './scheduleGenerator';

// Lundi 03/08/2026 → dimanche 09/08/2026, une semaine complète — dates
// choisies pour que le jour de semaine réel corresponde (03/08/2026 est
// bien un lundi).
const MONDAY = '2026-08-03';
const TUESDAY = '2026-08-04';
const SUNDAY = '2026-08-09';

describe('generateSchedule', () => {
  it('affecte un employé éligible à un besoin simple', () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: MONDAY,
      staffingRequirements: [{ weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 }],
      availabilities: [],
      employees: [{ id: 'u1', role: 'CUISINE' }],
    });
    expect(result.shifts).toEqual([{ userId: 'u1', role: 'CUISINE', date: MONDAY, startTime: '11:00', endTime: '15:00' }]);
    expect(result.unmetRequirements).toHaveLength(0);
  });

  it("ne remplit pas un besoin s'il n'y a aucun employé du bon rôle, et le signale", () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: MONDAY,
      staffingRequirements: [{ weekday: 'MONDAY', role: 'SERVICE', startTime: '11:00', endTime: '15:00', requiredCount: 2 }],
      availabilities: [],
      employees: [{ id: 'u1', role: 'CUISINE' }],
    });
    expect(result.shifts).toHaveLength(0);
    expect(result.unmetRequirements).toEqual([
      { date: MONDAY, role: 'SERVICE', startTime: '11:00', endTime: '15:00', missingCount: 2 },
    ]);
  });

  it('respecte une règle de disponibilité récurrente (jour de semaine)', () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: MONDAY,
      staffingRequirements: [{ weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 }],
      availabilities: [{ userId: 'u1', weekday: 'MONDAY', specificDate: null }],
      employees: [{ id: 'u1', role: 'CUISINE' }],
    });
    expect(result.shifts).toHaveLength(0);
    expect(result.unmetRequirements[0].missingCount).toBe(1);
  });

  it('respecte une règle de disponibilité ponctuelle (date précise)', () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: TUESDAY,
      staffingRequirements: [
        { weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 },
        { weekday: 'TUESDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 },
      ],
      availabilities: [{ userId: 'u1', weekday: null, specificDate: MONDAY }],
      employees: [{ id: 'u1', role: 'CUISINE' }],
    });
    // Indisponible le lundi seulement : le besoin du mardi doit être couvert.
    expect(result.shifts).toEqual([{ userId: 'u1', role: 'CUISINE', date: TUESDAY, startTime: '11:00', endTime: '15:00' }]);
    expect(result.unmetRequirements).toHaveLength(1);
    expect(result.unmetRequirements[0].date).toBe(MONDAY);
  });

  it("empêche d'affecter un employé le matin s'il a fini tard la veille (repos quotidien 11h, entre deux jours différents)", () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: TUESDAY,
      staffingRequirements: [
        { weekday: 'MONDAY', role: 'SERVICE', startTime: '18:00', endTime: '23:00', requiredCount: 1 },
        // 09:00 le mardi : seulement 10h de repos depuis 23h la veille (< 11h requis).
        { weekday: 'TUESDAY', role: 'SERVICE', startTime: '09:00', endTime: '13:00', requiredCount: 1 },
      ],
      availabilities: [],
      employees: [{ id: 'u1', role: 'SERVICE' }],
    });
    expect(result.shifts).toHaveLength(1);
    expect(result.shifts[0].date).toBe(MONDAY);
    expect(result.unmetRequirements).toHaveLength(1);
    expect(result.unmetRequirements[0].date).toBe(TUESDAY);
  });

  it('autorise deux services le même jour (coupure) sans exiger 11h entre les deux', () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: MONDAY,
      staffingRequirements: [
        { weekday: 'MONDAY', role: 'SERVICE', startTime: '11:00', endTime: '15:00', requiredCount: 1 },
        { weekday: 'MONDAY', role: 'SERVICE', startTime: '18:00', endTime: '22:00', requiredCount: 1 },
      ],
      availabilities: [],
      employees: [{ id: 'u1', role: 'SERVICE' }],
    });
    // 4h + 4h = 8h, sous le plafond quotidien de 10h : les deux services
    // sont couverts par le même employé, aucune indisponibilité.
    expect(result.shifts).toHaveLength(2);
    expect(result.unmetRequirements).toHaveLength(0);
  });

  it('respecte le plafond de 10h/jour (coupure trop longue cumulée)', () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: MONDAY,
      staffingRequirements: [
        { weekday: 'MONDAY', role: 'SERVICE', startTime: '09:00', endTime: '15:00', requiredCount: 1 }, // 6h
        { weekday: 'MONDAY', role: 'SERVICE', startTime: '17:00', endTime: '22:00', requiredCount: 1 }, // 5h → 11h cumulées, dépasse 10h
      ],
      availabilities: [],
      employees: [{ id: 'u1', role: 'SERVICE' }],
    });
    expect(result.shifts).toHaveLength(1);
    expect(result.unmetRequirements).toHaveLength(1);
  });

  it('équilibre la charge entre plusieurs employés éligibles (le moins sollicité en premier)', () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: TUESDAY,
      staffingRequirements: [
        { weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 },
        { weekday: 'TUESDAY', role: 'CUISINE', startTime: '11:00', endTime: '15:00', requiredCount: 1 },
      ],
      availabilities: [],
      employees: [
        { id: 'u1', role: 'CUISINE' },
        { id: 'u2', role: 'CUISINE' },
      ],
    });
    const assignedUsers = result.shifts.map((s) => s.userId);
    // Les deux besoins sont identiques et un seul employé requis à chaque
    // fois : l'équilibrage doit répartir sur les deux plutôt que de
    // toujours choisir le même.
    expect(new Set(assignedUsers).size).toBe(2);
  });

  it('signale les employés sans aucun jour de repos sur la période (repos hebdomadaire non garanti)', () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: SUNDAY,
      staffingRequirements: [
        { weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '13:00', requiredCount: 1 },
        { weekday: 'TUESDAY', role: 'CUISINE', startTime: '11:00', endTime: '13:00', requiredCount: 1 },
        { weekday: 'WEDNESDAY', role: 'CUISINE', startTime: '11:00', endTime: '13:00', requiredCount: 1 },
        { weekday: 'THURSDAY', role: 'CUISINE', startTime: '11:00', endTime: '13:00', requiredCount: 1 },
        { weekday: 'FRIDAY', role: 'CUISINE', startTime: '11:00', endTime: '13:00', requiredCount: 1 },
        { weekday: 'SATURDAY', role: 'CUISINE', startTime: '11:00', endTime: '13:00', requiredCount: 1 },
        { weekday: 'SUNDAY', role: 'CUISINE', startTime: '11:00', endTime: '13:00', requiredCount: 1 },
      ],
      availabilities: [],
      employees: [{ id: 'u1', role: 'CUISINE' }],
    });
    expect(result.employeeIdsWithoutRestDay).toEqual(['u1']);
  });

  it("ne signale pas un employé qui a au moins un jour sans créneau sur la période", () => {
    const result = generateSchedule({
      periodStart: MONDAY,
      periodEnd: TUESDAY,
      staffingRequirements: [{ weekday: 'MONDAY', role: 'CUISINE', startTime: '11:00', endTime: '13:00', requiredCount: 1 }],
      availabilities: [],
      employees: [{ id: 'u1', role: 'CUISINE' }],
    });
    expect(result.employeeIdsWithoutRestDay).toHaveLength(0);
  });
});
