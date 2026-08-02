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
