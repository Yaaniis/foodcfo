import { z } from 'zod';

export const weekdaySchema = z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);

// Une règle = une indisponibilité, récurrente (weekday) ou ponctuelle
// (specificDate), jamais les deux à la fois ni aucune des deux — même
// contrainte applicative que WasteEntry (productId/menuItemId), pas
// modélisable proprement en Prisma seul (voir schema.prisma).
export const createEmployeeAvailabilitySchema = z
  .object({
    userId: z.string().min(1, 'Employé requis.'),
    weekday: weekdaySchema.optional(),
    specificDate: z.coerce.date().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((data) => (data.weekday !== undefined) !== (data.specificDate !== undefined), {
    message: 'Préciser soit un jour de la semaine récurrent, soit une date précise (jamais les deux, ni aucun des deux).',
    path: ['weekday'],
  });

export type CreateEmployeeAvailabilityInput = z.infer<typeof createEmployeeAvailabilitySchema>;
