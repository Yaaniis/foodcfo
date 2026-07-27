import { z } from 'zod';

// Un identifiant de fuseau horaire invalide ferait planter tout calcul
// "ce mois-ci" (Intl.DateTimeFormat lève une RangeError, voir
// lib/timezone.ts) — validé contre la liste IANA officielle exposée
// par le moteur JS plutôt que laissé en texte libre. Réutilisé sur les
// trois endpoints qui écrivent Restaurant.timezone (bootstrap, add,
// update) : seul updateRestaurantSchema l'utilisait jusqu'ici, alors
// que bootstrap/add acceptaient un z.string() nu — un appel API direct
// (pas via le frontend actuel, qui n'envoie jamais ce champ à la
// création) aurait pu créer un restaurant avec un fuseau qui fait
// planter son propre tableau de bord dès le premier chargement.
export const ianaTimezoneSchema = z.string().refine((value) => Intl.supportedValuesOf('timeZone').includes(value), {
  message: 'Fuseau horaire invalide.',
});

export const bootstrapRestaurantSchema = z.object({
  restaurantName: z.string().min(1, 'Le nom du restaurant est requis.'),
  currency: z.string().default('EUR'),
  timezone: ianaTimezoneSchema.default('Europe/Paris'),
  gerant: z.object({
    email: z.string().email('Adresse email invalide.'),
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
    firstName: z.string().min(1, 'Prénom requis.'),
    lastName: z.string().min(1, 'Nom requis.'),
  }),
  // Case à cocher obligatoire côté frontend (CGU/confidentialité) — un
  // littéral `true` plutôt qu'un booléen simple pour que "false" ou
  // absent échouent tous deux la validation, pas seulement "absent".
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Vous devez accepter les CGU pour créer un compte.' }) }),
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

export const updateRestaurantSchema = z
  .object({
    name: z.string().min(1).optional(),
    timezone: ianaTimezoneSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ à modifier est requis.',
  });

export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;

// Ajout d'un restaurant supplémentaire au compte du Gérant déjà
// connecté — pas de mot de passe à ressaisir (contrairement à
// bootstrap, réservé aux tout premiers comptes non authentifiés) : le
// hash existant est copié tel quel, voir restaurant.controller.ts.
export const addRestaurantSchema = z.object({
  restaurantName: z.string().min(1, 'Le nom du restaurant est requis.'),
  currency: z.string().default('EUR'),
  timezone: ianaTimezoneSchema.default('Europe/Paris'),
});

export type AddRestaurantInput = z.infer<typeof addRestaurantSchema>;

export const switchRestaurantSchema = z.object({
  restaurantId: z.string().min(1, 'Identifiant de restaurant requis.'),
});

export type SwitchRestaurantInput = z.infer<typeof switchRestaurantSchema>;
