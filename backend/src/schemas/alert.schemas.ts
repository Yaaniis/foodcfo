import { z } from 'zod';

// Une alerte ACTIVE peut être résolue (le Gérant/la Cuisine a corrigé
// le prix ou la recette) ou ignorée (jugée non pertinente) — jamais
// remise à ACTIVE via cette route, qui est le résultat automatique du
// recalcul de marge (voir lib/marginAlerts.ts), pas une action manuelle.
export const updateAlertStatusSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
});

export type UpdateAlertStatusInput = z.infer<typeof updateAlertStatusSchema>;
