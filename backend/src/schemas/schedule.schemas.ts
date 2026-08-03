import { z } from 'zod';

const dateOnlySchema = z.coerce.date();

export const generateScheduleSchema = z
  .object({
    periodStart: dateOnlySchema,
    periodEnd: dateOnlySchema,
  })
  .refine((data) => data.periodStart <= data.periodEnd, {
    message: 'La date de fin doit être après la date de début.',
    path: ['periodEnd'],
  })
  .refine((data) => (data.periodEnd.getTime() - data.periodStart.getTime()) / 86_400_000 <= 31, {
    message: 'La période ne peut pas dépasser 31 jours.',
    path: ['periodEnd'],
  });

export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide (attendu HH:mm, ex: 11:30).');

// Correction après coup d'un créneau déjà généré (retard, départ
// anticipé, absence) — jamais la version "prévue" (startTime/endTime),
// toujours actualStartTime/actualEndTime, exactement comme prévu dès
// la Phase 7.1 (voir schema.prisma, commentaire sur ShiftAssignment) :
// c'est cette version "actuelle" qui alimente le récapitulatif
// d'heures pour le comptable, jamais la version prévue seule.
export const adjustShiftAssignmentSchema = z
  .object({
    isAbsent: z.boolean().optional(),
    absenceNote: z.string().min(1, 'Motif requis.').nullable().optional(),
    actualStartTime: timeStringSchema.nullable().optional(),
    actualEndTime: timeStringSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Au moins un champ à modifier est requis.' })
  .refine((data) => (data.actualStartTime == null) === (data.actualEndTime == null), {
    message: 'Renseigner les deux heures effectives, ou aucune des deux.',
    path: ['actualEndTime'],
  })
  .refine((data) => !data.actualStartTime || !data.actualEndTime || data.actualStartTime < data.actualEndTime, {
    message: "L'heure de fin effective doit être après l'heure de début effective.",
    path: ['actualEndTime'],
  });

export type AdjustShiftAssignmentInput = z.infer<typeof adjustShiftAssignmentSchema>;
