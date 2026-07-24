import { z } from 'zod';

export const bootstrapRestaurantSchema = z.object({
  restaurantName: z.string().min(1, 'Le nom du restaurant est requis.'),
  currency: z.string().default('EUR'),
  timezone: z.string().default('Europe/Paris'),
  gerant: z.object({
    email: z.string().email('Adresse email invalide.'),
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
    firstName: z.string().min(1, 'Prénom requis.'),
    lastName: z.string().min(1, 'Nom requis.'),
  }),
});

export type BootstrapRestaurantInput = z.infer<typeof bootstrapRestaurantSchema>;
