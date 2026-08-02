import { describe, it, expect } from 'vitest';
import { parseTimeString, formatTimeToString } from './time';

describe('parseTimeString / formatTimeToString', () => {
  it('convertit "HH:mm" en Date UTC calée sur l’epoch, et inversement', () => {
    const date = parseTimeString('11:30');
    expect(date.toISOString()).toBe('1970-01-01T11:30:00.000Z');
    expect(formatTimeToString(date)).toBe('11:30');
  });

  it('gère minuit et 23:59 (bornes)', () => {
    expect(formatTimeToString(parseTimeString('00:00'))).toBe('00:00');
    expect(formatTimeToString(parseTimeString('23:59'))).toBe('23:59');
  });

  it('rejette un format invalide', () => {
    expect(() => parseTimeString('25:00')).toThrow();
    expect(() => parseTimeString('11h30')).toThrow();
    expect(() => parseTimeString('')).toThrow();
  });
});
