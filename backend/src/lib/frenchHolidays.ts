// Jours fériés légaux français (Phase 7.2, récapitulatif d'heures) —
// fonction pure, aucun accès base, comme scheduleGenerator.ts.
//
// 7 jours fixes + 4 jours mobiles dépendant de Pâques (algorithme de
// Meeus/Jones/Butcher, calendrier grégorien — vérifié empiriquement
// contre 4 dates de référence connues avant écriture des tests : Pâques
// 2023-04-09, 2024-03-31, 2025-04-20, 2027-03-28, toutes correctes).
// Le Vendredi saint et le 26 décembre (fériés seulement en
// Alsace-Moselle) sont volontairement exclus : régime local, pas la
// règle générale applicable à l'immense majorité des restaurants.

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function fixedDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

// Les 11 jours fériés légaux (Code du travail, art. L3133-1), hors
// régime local Alsace-Moselle.
function holidaysForYear(year: number): Set<string> {
  const easter = easterSunday(year);
  return new Set([
    fixedDate(year, 1, 1), // Jour de l'an
    addDays(easter, 1), // Lundi de Pâques
    fixedDate(year, 5, 1), // Fête du travail
    fixedDate(year, 5, 8), // Victoire 1945
    addDays(easter, 39), // Ascension
    addDays(easter, 50), // Lundi de Pentecôte
    fixedDate(year, 7, 14), // Fête nationale
    fixedDate(year, 8, 15), // Assomption
    fixedDate(year, 11, 1), // Toussaint
    fixedDate(year, 11, 11), // Armistice 1918
    fixedDate(year, 12, 25), // Noël
  ]);
}

const holidayCache = new Map<number, Set<string>>();

export function isFrenchPublicHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  let holidays = holidayCache.get(year);
  if (!holidays) {
    holidays = holidaysForYear(year);
    holidayCache.set(year, holidays);
  }
  return holidays.has(dateStr);
}
