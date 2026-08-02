import { z } from 'zod';

// multipart/form-data (upload média optionnel) : les champs texte
// arrivent en string brute dans req.body, jamais en JSON — même
// contrainte que uploadInvoice (invoice.schemas.ts n'a d'ailleurs pas
// de schéma dédié pour cette raison, validé directement dans le
// contrôleur ; ici la validation reste assez simple pour un schéma Zod
// classique appliqué à req.body).
export const createHygieneReferenceItemSchema = z.object({
  title: z.string().min(1, 'Titre requis.'),
  content: z.string().min(1, 'Contenu requis.'),
});

export const updateHygieneReferenceItemSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
});

export type CreateHygieneReferenceItemInput = z.infer<typeof createHygieneReferenceItemSchema>;
export type UpdateHygieneReferenceItemInput = z.infer<typeof updateHygieneReferenceItemSchema>;
