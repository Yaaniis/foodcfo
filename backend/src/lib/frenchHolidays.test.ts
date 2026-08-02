import { describe, it, expect } from 'vitest';
import { isFrenchPublicHoliday } from './frenchHolidays';

describe('isFrenchPublicHoliday', () => {
  it('reconnaît les 7 jours fériés fixes (2026)', () => {
    expect(isFrenchPublicHoliday('2026-01-01')).toBe(true);
    expect(isFrenchPublicHoliday('2026-05-01')).toBe(true);
    expect(isFrenchPublicHoliday('2026-05-08')).toBe(true);
    expect(isFrenchPublicHoliday('2026-07-14')).toBe(true);
    expect(isFrenchPublicHoliday('2026-08-15')).toBe(true);
    expect(isFrenchPublicHoliday('2026-11-01')).toBe(true);
    expect(isFrenchPublicHoliday('2026-11-11')).toBe(true);
    expect(isFrenchPublicHoliday('2026-12-25')).toBe(true);
  });

  it('reconnaît les 4 jours fériés mobiles (2026, dépendant de Pâques le 05/04/2026)', () => {
    expect(isFrenchPublicHoliday('2026-04-06')).toBe(true); // Lundi de Pâques
    expect(isFrenchPublicHoliday('2026-05-14')).toBe(true); // Ascension
    expect(isFrenchPublicHoliday('2026-05-25')).toBe(true); // Lundi de Pentecôte
  });

  it("reconnaît aussi les jours fériés d'une autre année (2025, Pâques le 20/04/2025)", () => {
    expect(isFrenchPublicHoliday('2025-04-21')).toBe(true); // Lundi de Pâques 2025
    expect(isFrenchPublicHoliday('2025-01-01')).toBe(true);
  });

  it("ne signale pas un jour ordinaire, ni le Vendredi saint (régime local uniquement)", () => {
    expect(isFrenchPublicHoliday('2026-08-03')).toBe(false);
    expect(isFrenchPublicHoliday('2026-04-03')).toBe(false); // Vendredi saint 2026
  });
});
