// Récapitulatif d'heures pour le comptable (Phase 7.2) — fonction pure,
// comme scheduleGenerator.ts. Remplace volontairement la génération
// d'un bulletin de paye légal (décision actée en 7.0 : trop risqué
// juridiquement — convention HCR, cotisations URSSAF, prélèvement à la
// source... — le comptable reste responsable du bulletin réel, cet
// export ne fait que lui fournir une base d'heures structurée).
//
// Heures normales/supplémentaires : cumulées par semaine ISO (lundi à
// dimanche), seuil de 35h — plafond légal simple et bien documenté,
// pas une tentative d'appliquer l'intégralité des règles de majoration
// de la convention collective HCR (taux différents par tranche, etc.),
// même logique de "socle stable" que scheduleGenerator.ts.
// Dimanche/jour férié : étiquettes indépendantes posées sur les mêmes
// heures (pas une troisième catégorie qui retire des heures normales/
// sup) — le comptable a besoin de savoir combien d'heures tombaient un
// dimanche ou un jour férié pour appliquer lui-même les majorations
// applicables, quel que soit leur statut normal/sup par ailleurs.

import { mondayOfWeek, weekdayOf } from './calendarDate';
import { isFrenchPublicHoliday } from './frenchHolidays';

const WEEKLY_REGULAR_THRESHOLD_MINUTES = 35 * 60;

export interface WorkedShiftInput {
  userId: string;
  firstName: string;
  lastName: string;
  date: string; // "YYYY-MM-DD"
  minutesWorked: number; // 0 si absent (isAbsent) — n'a alors contribué aucune heure réelle
}

export interface EmployeeHoursSummary {
  userId: string;
  firstName: string;
  lastName: string;
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  sundayMinutes: number;
  publicHolidayMinutes: number;
}

export function computeHoursSummary(shifts: WorkedShiftInput[]): EmployeeHoursSummary[] {
  const shiftsByEmployee = new Map<string, { firstName: string; lastName: string; shifts: WorkedShiftInput[] }>();
  for (const shift of shifts) {
    const entry = shiftsByEmployee.get(shift.userId) ?? { firstName: shift.firstName, lastName: shift.lastName, shifts: [] };
    entry.shifts.push(shift);
    shiftsByEmployee.set(shift.userId, entry);
  }

  const summaries: EmployeeHoursSummary[] = [];

  for (const [userId, { firstName, lastName, shifts: employeeShifts }] of shiftsByEmployee) {
    let regularMinutes = 0;
    let overtimeMinutes = 0;
    let sundayMinutes = 0;
    let publicHolidayMinutes = 0;

    const minutesByWeek = new Map<string, number>();
    for (const shift of employeeShifts) {
      const week = mondayOfWeek(shift.date);
      minutesByWeek.set(week, (minutesByWeek.get(week) ?? 0) + shift.minutesWorked);

      if (weekdayOf(shift.date) === 'SUNDAY') sundayMinutes += shift.minutesWorked;
      if (isFrenchPublicHoliday(shift.date)) publicHolidayMinutes += shift.minutesWorked;
    }

    for (const weekMinutes of minutesByWeek.values()) {
      regularMinutes += Math.min(weekMinutes, WEEKLY_REGULAR_THRESHOLD_MINUTES);
      overtimeMinutes += Math.max(0, weekMinutes - WEEKLY_REGULAR_THRESHOLD_MINUTES);
    }

    summaries.push({
      userId,
      firstName,
      lastName,
      totalMinutes: regularMinutes + overtimeMinutes,
      regularMinutes,
      overtimeMinutes,
      sundayMinutes,
      publicHolidayMinutes,
    });
  }

  return summaries.sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
}
