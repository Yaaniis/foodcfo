// Générateur automatique de planning (Phase 7.2) — fonction pure (aucun
// accès base de données ici, comme margin.ts) pour rester testable
// précisément sans dépendre de Postgres.
//
// Portée volontairement limitée au "socle stable" décidé avec
// l'utilisateur (voir FoodCFO_PLAN.md, Phase 7.0) plutôt qu'à
// l'exhaustivité de la convention collective HCR :
// - Repos quotidien (11h consécutives, Code du travail) appliqué UNIQUEMENT
//   entre deux jours civils différents (dernier créneau du jour N → premier
//   créneau du jour N+1). Les coupures (plusieurs services le même jour,
//   ex: service midi + service soir) ne sont PAS contraintes par une règle
//   d'amplitude spécifique à ce stade — la convention HCR a ses propres
//   règles sur les coupures, pas encore encodées (à affiner).
// - Durée max par jour : 10h cumulées (créneaux du même jour additionnés).
// - Durée max par semaine : 48h cumulées sur toute la période (plafond
//   absolu, directive européenne).
// - Repos hebdomadaire (35h) : pas une contrainte dure pendant
//   l'affectation (garantir un jour de repos à chacun tout en couvrant
//   tous les besoins peut être impossible selon les contraintes saisies),
//   mais vérifié après coup et remonté comme avertissement si un employé
//   n'a aucun jour sans créneau sur la période.
//
// Toujours généré en DRAFT — jamais appliqué sans validation humaine
// explicite (voir Schedule.status dans schema.prisma).

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type Role = 'GERANT' | 'CUISINE' | 'SERVICE';

const WEEKDAY_ORDER: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const MAX_DAILY_MINUTES = 10 * 60;
const MAX_WEEKLY_MINUTES = 48 * 60;
const MIN_DAILY_REST_MINUTES = 11 * 60;

export interface StaffingRequirementInput {
  weekday: Weekday;
  role: Role;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  requiredCount: number;
}

export interface EmployeeAvailabilityInput {
  userId: string;
  weekday: Weekday | null;
  specificDate: string | null; // "YYYY-MM-DD"
}

export interface EmployeeInput {
  id: string;
  role: Role;
}

export interface GeneratedShift {
  userId: string;
  role: Role;
  date: string; // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
}

export interface UnmetRequirement {
  date: string;
  role: Role;
  startTime: string;
  endTime: string;
  missingCount: number;
}

export interface GenerateScheduleResult {
  shifts: GeneratedShift[];
  unmetRequirements: UnmetRequirement[];
  // Employés n'ayant eu aucun jour entièrement sans créneau sur la
  // période — le repos hebdomadaire (35h) n'est pas garanti pour eux,
  // à vérifier manuellement avant validation.
  employeeIdsWithoutRestDay: string[];
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(dateStr: string): Weekday {
  const date = new Date(`${dateStr}T00:00:00Z`);
  // getUTCDay() : 0 = dimanche → réaligné sur WEEKDAY_ORDER (lundi en tête).
  const index = (date.getUTCDay() + 6) % 7;
  return WEEKDAY_ORDER[index];
}

export function generateSchedule(input: {
  periodStart: string; // "YYYY-MM-DD"
  periodEnd: string; // "YYYY-MM-DD", inclus
  staffingRequirements: StaffingRequirementInput[];
  availabilities: EmployeeAvailabilityInput[];
  employees: EmployeeInput[];
}): GenerateScheduleResult {
  const dates: string[] = [];
  for (let d = input.periodStart; d <= input.periodEnd; d = addDays(d, 1)) {
    dates.push(d);
  }

  const unavailableByUser = new Map<string, { weekdays: Set<Weekday>; dates: Set<string> }>();
  for (const rule of input.availabilities) {
    const entry = unavailableByUser.get(rule.userId) ?? { weekdays: new Set(), dates: new Set() };
    if (rule.weekday) entry.weekdays.add(rule.weekday);
    if (rule.specificDate) entry.dates.add(rule.specificDate);
    unavailableByUser.set(rule.userId, entry);
  }

  const shifts: GeneratedShift[] = [];
  const unmetRequirements: UnmetRequirement[] = [];

  const weeklyMinutes = new Map<string, number>();
  const dailyMinutes = new Map<string, number>(); // clé: `${userId}|${date}`
  const lastShiftEndByUserByDate = new Map<string, { date: string; endMinutes: number }>();
  const daysWorkedByUser = new Map<string, Set<string>>();

  function isUnavailable(userId: string, date: string, weekday: Weekday): boolean {
    const rules = unavailableByUser.get(userId);
    if (!rules) return false;
    return rules.weekdays.has(weekday) || rules.dates.has(date);
  }

  function violatesDailyRest(userId: string, date: string, startMinutes: number): boolean {
    const last = lastShiftEndByUserByDate.get(userId);
    if (!last || last.date === date) return false; // coupure même jour : pas contrainte ici, voir en-tête du fichier
    // Repos entre la fin du dernier créneau (jour précédent) et le début
    // de celui-ci : (minutes jusqu'à minuit) + (minutes depuis minuit).
    const gap = 24 * 60 - last.endMinutes + startMinutes;
    return gap < MIN_DAILY_REST_MINUTES;
  }

  for (const date of dates) {
    const weekday = weekdayOf(date);
    const requirementsToday = input.staffingRequirements
      .filter((r) => r.weekday === weekday)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    for (const requirement of requirementsToday) {
      const startMinutes = toMinutes(requirement.startTime);
      const endMinutes = toMinutes(requirement.endTime);
      const duration = endMinutes - startMinutes;

      const eligible = input.employees
        .filter((e) => e.role === requirement.role)
        .filter((e) => !isUnavailable(e.id, date, weekday))
        .filter((e) => !violatesDailyRest(e.id, date, startMinutes))
        .filter((e) => ((dailyMinutes.get(`${e.id}|${date}`) ?? 0) + duration) <= MAX_DAILY_MINUTES)
        .filter((e) => ((weeklyMinutes.get(e.id) ?? 0) + duration) <= MAX_WEEKLY_MINUTES)
        // Équilibrage de charge : les moins sollicités jusqu'ici d'abord.
        .sort((a, b) => (weeklyMinutes.get(a.id) ?? 0) - (weeklyMinutes.get(b.id) ?? 0));

      const assigned = eligible.slice(0, requirement.requiredCount);

      if (assigned.length < requirement.requiredCount) {
        unmetRequirements.push({
          date,
          role: requirement.role,
          startTime: requirement.startTime,
          endTime: requirement.endTime,
          missingCount: requirement.requiredCount - assigned.length,
        });
      }

      for (const employee of assigned) {
        shifts.push({ userId: employee.id, role: requirement.role, date, startTime: requirement.startTime, endTime: requirement.endTime });
        weeklyMinutes.set(employee.id, (weeklyMinutes.get(employee.id) ?? 0) + duration);
        dailyMinutes.set(`${employee.id}|${date}`, (dailyMinutes.get(`${employee.id}|${date}`) ?? 0) + duration);
        lastShiftEndByUserByDate.set(employee.id, { date, endMinutes });
        const days = daysWorkedByUser.get(employee.id) ?? new Set<string>();
        days.add(date);
        daysWorkedByUser.set(employee.id, days);
      }
    }
  }

  const employeeIdsWithoutRestDay = input.employees
    .filter((e) => (daysWorkedByUser.get(e.id)?.size ?? 0) >= dates.length && dates.length > 0)
    .map((e) => e.id);

  return { shifts, unmetRequirements, employeeIdsWithoutRestDay };
}
