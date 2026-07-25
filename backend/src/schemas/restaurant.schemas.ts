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

// Seuils de marge (décision 0.6 : vert ≥ 70%, orange 60-70%, rouge <
// 60% par défaut, mais modifiables par le gérant). Le seuil vert doit
// toujours être strictement supérieur au seuil orange, sinon la
// classification vert/orange/rouge n'a plus de sens.
export const updateThresholdsSchema = z
  .object({
    marginGreenThreshold: z.coerce.number().min(0).max(100),
    marginOrangeThreshold: z.coerce.number().min(0).max(100),
  })
  .refine((data) => data.marginGreenThreshold > data.marginOrangeThreshold, {
    message: 'Le seuil vert doit être strictement supérieur au seuil orange.',
    path: ['marginGreenThreshold'],
  });

export type UpdateThresholdsInput = z.infer<typeof updateThresholdsSchema>;

// Ajout d'un restaurant supplémentaire au compte du Gérant déjà
// connecté — pas de mot de passe à ressaisir (contrairement à
// bootstrap, réservé aux tout premiers comptes non authentifiés) : le
// hash existant est copié tel quel, voir restaurant.controller.ts.
export const addRestaurantSchema = z.object({
  restaurantName: z.string().min(1, 'Le nom du restaurant est requis.'),
  currency: z.string().default('EUR'),
  timezone: z.string().default('Europe/Paris'),
});

export type AddRestaurantInput = z.infer<typeof addRestaurantSchema>;

export const switchRestaurantSchema = z.object({
  restaurantId: z.string().min(1, 'Identifiant de restaurant requis.'),
});

export type SwitchRestaurantInput = z.infer<typeof switchRestaurantSchema>;
