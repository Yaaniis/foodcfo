import { z } from 'zod';

// Suppression irréversible : on exige que le Gérant retape le nom exact
// du restaurant (comme GitHub le fait pour la suppression d'un dépôt),
// pour qu'un clic accidentel ou un rejeu de requête ne puisse jamais
// déclencher la suppression sans confirmation explicite et délibérée.
export const deleteRestaurantSchema = z.object({
  confirmRestaurantName: z.string().min(1, 'Le nom du restaurant est requis pour confirmer.'),
});

export type DeleteRestaurantInput = z.infer<typeof deleteRestaurantSchema>;
