import { describe, it, expect } from 'vitest';
import { computeHoursSummary } from './hoursSummary';

// Lundi 03/08/2026 → dimanche 09/08/2026, une semaine complète (mêmes
// dates que scheduleGenerator.test.ts, déjà vérifiées empiriquement).
const MONDAY = '2026-08-03';
const SUNDAY = '2026-08-09';

describe('computeHoursSummary', () => {
  it('additionne les heures normales sous le seuil de 35h/semaine', () => {
    const result = computeHoursSummary([
      { userId: 'u1', firstName: 'Marie', lastName: 'Service', date: MONDAY, minutesWorked: 6 * 60 },
    ]);
    expect(result).toEqual([
      {
        userId: 'u1',
        firstName: 'Marie',
        lastName: 'Service',
        totalMinutes: 360,
        regularMinutes: 360,
        overtimeMinutes: 0,
        sundayMinutes: 0,
        publicHolidayMinutes: 0,
      },
    ]);
  });

  it('bascule en heures supplémentaires au-delà de 35h cumulées sur la même semaine ISO', () => {
    // 6 jours à 7h = 42h : 35h normales + 7h sup.
    const shifts = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'].map((date) => ({
      userId: 'u1',
      firstName: 'Marie',
      lastName: 'Service',
      date,
      minutesWorked: 7 * 60,
    }));
    const [summary] = computeHoursSummary(shifts);
    expect(summary.regularMinutes).toBe(35 * 60);
    expect(summary.overtimeMinutes).toBe(7 * 60);
    expect(summary.totalMinutes).toBe(42 * 60);
  });

  it("ne mélange pas les heures de deux semaines ISO différentes (pas d'heures sup à tort)", () => {
    // 20h la semaine du 03/08 (lundi) + 20h la semaine du 10/08 (lundi
    // suivant) : 40h au total mais aucune semaine ne dépasse 35h seule.
    const result = computeHoursSummary([
      { userId: 'u1', firstName: 'Marie', lastName: 'Service', date: '2026-08-03', minutesWorked: 20 * 60 },
      { userId: 'u1', firstName: 'Marie', lastName: 'Service', date: '2026-08-10', minutesWorked: 20 * 60 },
    ]);
    expect(result[0].regularMinutes).toBe(40 * 60);
    expect(result[0].overtimeMinutes).toBe(0);
  });

  it('étiquette les heures travaillées un dimanche, indépendamment du compteur normal/sup', () => {
    const result = computeHoursSummary([
      { userId: 'u1', firstName: 'Marie', lastName: 'Service', date: SUNDAY, minutesWorked: 4 * 60 },
    ]);
    expect(result[0].sundayMinutes).toBe(4 * 60);
    expect(result[0].regularMinutes).toBe(4 * 60); // reste aussi compté en heures normales
  });

  it('étiquette les heures travaillées un jour férié (01/01/2026)', () => {
    const result = computeHoursSummary([
      { userId: 'u1', firstName: 'Marie', lastName: 'Service', date: '2026-01-01', minutesWorked: 5 * 60 },
    ]);
    expect(result[0].publicHolidayMinutes).toBe(5 * 60);
  });

  it('sépare correctement plusieurs employés et trie par nom', () => {
    const result = computeHoursSummary([
      { userId: 'u2', firstName: 'Karim', lastName: 'Zidane', date: MONDAY, minutesWorked: 60 },
      { userId: 'u1', firstName: 'Marie', lastName: 'Abou', date: MONDAY, minutesWorked: 120 },
    ]);
    expect(result.map((r) => r.userId)).toEqual(['u1', 'u2']);
    expect(result[0].totalMinutes).toBe(120);
    expect(result[1].totalMinutes).toBe(60);
  });

  it('un créneau à 0 minute (absence) ne contribue à aucun compteur', () => {
    const result = computeHoursSummary([
      { userId: 'u1', firstName: 'Marie', lastName: 'Service', date: SUNDAY, minutesWorked: 0 },
    ]);
    expect(result[0].totalMinutes).toBe(0);
    expect(result[0].sundayMinutes).toBe(0);
  });
});
