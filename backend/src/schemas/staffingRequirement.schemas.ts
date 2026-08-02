import { z } from 'zod';
import { weekdaySchema } from './availability.schemas';
import { roleSchema } from './user.schemas';

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (attendu HH:mm, ex: 11:30).");

// Comparaison lexicographique directe sur "HH:mm" : valide tant que le
// format est bien HH:mm zero-paddé (garanti par timeStringSchema
// ci-dessus), pas besoin de parser en Date pour comparer.
export const createStaffingRequirementSchema = z
  .object({
    weekday: weekdaySchema,
    role: roleSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    requiredCount: z.coerce.number().int().positive('Le nombre de personnes doit être positif.'),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "L'heure de fin doit être après l'heure de début.",
    path: ['endTime'],
  });

export type CreateStaffingRequirementInput = z.infer<typeof createStaffingRequirementSchema>;
