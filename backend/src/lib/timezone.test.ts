import { describe, it, expect } from 'vitest';
import { monthRangeInTimezone } from './timezone';

describe('monthRangeInTimezone', () => {
  it('calcule le 1er du mois à minuit heure de Paris en hiver (UTC+1) — pas en UTC', () => {
    // 15 janvier 2026, 10h UTC : n'importe quel instant du mois suffit comme référence.
    const { monthStart, monthEnd, monthLabel } = monthRangeInTimezone(
      new Date('2026-01-15T10:00:00Z'),
      'Europe/Paris',
    );
    // Minuit à Paris le 1er janvier (UTC+1) = 31 déc 23h00 UTC — pas 1er janvier 00h00 UTC.
    expect(monthStart.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(monthEnd.toISOString()).toBe('2026-01-31T23:00:00.000Z');
    expect(monthLabel).toBe('2026-01');
  });

  it('calcule le 1er du mois à minuit heure de Paris en été (UTC+2)', () => {
    const { monthStart, monthEnd } = monthRangeInTimezone(new Date('2026-07-15T10:00:00Z'), 'Europe/Paris');
    // Minuit à Paris le 1er juillet (UTC+2) = 30 juin 22h00 UTC.
    expect(monthStart.toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(monthEnd.toISOString()).toBe('2026-07-31T22:00:00.000Z');
  });

  it("un évènement à 23h30 UTC le 31 décembre appartient déjà à janvier côté Paris (le bug corrigé : un calcul en UTC pur l'aurait classé en décembre)", () => {
    // 31 décembre 2026, 23h30 UTC = 1er janvier 2027, 00h30 à Paris (hiver, UTC+1).
    const almostMidnightUtc = new Date('2026-12-31T23:30:00Z');
    const { monthLabel, monthStart, monthEnd } = monthRangeInTimezone(almostMidnightUtc, 'Europe/Paris');
    expect(monthLabel).toBe('2027-01');
    expect(almostMidnightUtc >= monthStart && almostMidnightUtc < monthEnd).toBe(true);
  });

  it('gère le changement d’année (décembre → janvier)', () => {
    const { monthStart, monthEnd, monthLabel } = monthRangeInTimezone(
      new Date('2026-12-15T10:00:00Z'),
      'Europe/Paris',
    );
    expect(monthLabel).toBe('2026-12');
    // 1er décembre 2026 00h00 Paris (hiver, UTC+1) = 30 nov 23h00 UTC.
    expect(monthStart.toISOString()).toBe('2026-11-30T23:00:00.000Z');
    // 1er janvier 2027 00h00 Paris (hiver, UTC+1) = 31 déc 2026 23h00 UTC.
    expect(monthEnd.toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });

  it('fonctionne aussi avec UTC pur (fuseau neutre, pas de décalage attendu)', () => {
    const { monthStart, monthEnd } = monthRangeInTimezone(new Date('2026-03-15T10:00:00Z'), 'UTC');
    expect(monthStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(monthEnd.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});
