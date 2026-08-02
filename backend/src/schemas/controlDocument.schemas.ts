import { z } from 'zod';

export const controlOrganismSchema = z.enum(['URSSAF', 'DDPP', 'DGCCRF', 'DGFIP', 'INSPECTION_TRAVAIL']);

// multipart/form-data (upload de fichier) : les champs texte arrivent
// en string brute dans req.body — même contrainte que
// hygieneReferenceItem.schemas.ts.
export const createControlDocumentSchema = z.object({
  organism: controlOrganismSchema,
  category: z.string().min(1, 'Catégorie requise.'),
  label: z.string().min(1, 'Libellé requis.'),
});

export type CreateControlDocumentInput = z.infer<typeof createControlDocumentSchema>;
