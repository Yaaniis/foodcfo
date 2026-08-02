// Petits helpers de date calendaire partagés (chaînes "YYYY-MM-DD",
// toujours en UTC pour éviter tout décalage de fuseau — même
// raisonnement que scheduleGenerator.ts, qui garde sa propre copie
// privée de ces deux fonctions car il a été livré et testé avant que
// frenchHolidays.ts/hoursSummary.ts n'en aient aussi besoin).

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

const WEEKDAY_ORDER: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(dateStr: string): Weekday {
  const date = new Date(`${dateStr}T00:00:00Z`);
  // getUTCDay() : 0 = dimanche → réaligné sur WEEKDAY_ORDER (lundi en tête).
  const index = (date.getUTCDay() + 6) % 7;
  return WEEKDAY_ORDER[index];
}

// Lundi de la semaine ISO contenant cette date — clé de regroupement
// pour le calcul des heures supplémentaires hebdomadaires.
export function mondayOfWeek(dateStr: string): string {
  const index = WEEKDAY_ORDER.indexOf(weekdayOf(dateStr));
  return addDays(dateStr, -index);
}
