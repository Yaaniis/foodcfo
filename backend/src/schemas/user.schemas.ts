import { z } from 'zod';

const roleSchema = z.enum(['GERANT', 'CUISINE', 'SERVICE']);

export const createUserSchema = z.object({
  email: z.string().email('Adresse email invalide.'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
  firstName: z.string().min(1, 'Prénom requis.'),
  lastName: z.string().min(1, 'Nom requis.'),
  role: roleSchema,
});

export const updateUserSchema = z
  .object({
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ à modifier est requis.',
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
