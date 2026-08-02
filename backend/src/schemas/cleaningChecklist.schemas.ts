import { z } from 'zod';

// Le gabarit et ses éléments sont créés ensemble, en un seul appel —
// pas de CRUD séparé sur les items : une fois qu'une complétion existe
// pour ce gabarit, ses items ne doivent plus changer (CleaningChecklistCompletionItem.templateItemId
// est en onDelete: Restrict, voir schema.prisma). Pour faire évoluer une
// checklist, on désactive l'ancien gabarit et on en crée un nouveau —
// même logique que Supplier.isActive.
export const createCleaningChecklistTemplateSchema = z.object({
  name: z.string().min(1, 'Nom requis.'),
  items: z.array(z.string().min(1, 'Libellé requis.')).min(1, 'Au moins un élément requis.'),
});

export const createCleaningChecklistCompletionSchema = z.object({
  templateId: z.string().min(1),
  serviceDate: z.coerce.date(),
});

export const toggleCleaningChecklistCompletionItemSchema = z.object({
  isChecked: z.boolean(),
});

export type CreateCleaningChecklistTemplateInput = z.infer<typeof createCleaningChecklistTemplateSchema>;
export type CreateCleaningChecklistCompletionInput = z.infer<typeof createCleaningChecklistCompletionSchema>;
