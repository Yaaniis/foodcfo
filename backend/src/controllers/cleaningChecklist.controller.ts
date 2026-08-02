import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  createCleaningChecklistTemplateSchema,
  createCleaningChecklistCompletionSchema,
  toggleCleaningChecklistCompletionItemSchema,
} from '../schemas/cleaningChecklist.schemas';

// ============================================================
// Gabarits (CleaningChecklistTemplate)
// ============================================================

export async function listCleaningChecklistTemplates(req: Request, res: Response) {
  const templates = await prisma.cleaningChecklistTemplate.findMany({
    where: { restaurantId: req.user!.restaurantId, isActive: true },
    include: { items: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ templates });
}

export async function createCleaningChecklistTemplate(req: Request, res: Response) {
  const input = createCleaningChecklistTemplateSchema.parse(req.body);

  const template = await prisma.cleaningChecklistTemplate.create({
    data: {
      restaurantId: req.user!.restaurantId,
      name: input.name,
      items: { create: input.items.map((label, index) => ({ label, order: index })) },
    },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  res.status(201).json({ template });
}

// Désactivation, pas suppression physique — voir le commentaire sur
// createCleaningChecklistTemplateSchema (schema.prisma bloquerait de
// toute façon un hard-delete dès qu'une complétion existe).
export async function deleteCleaningChecklistTemplate(req: Request, res: Response) {
  const existing = await prisma.cleaningChecklistTemplate.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Modèle de checklist introuvable.' });
  }
  await prisma.cleaningChecklistTemplate.update({ where: { id: existing.id }, data: { isActive: false } });
  res.status(204).send();
}

// ============================================================
// Complétions (CleaningChecklistCompletion) — l'usage quotidien :
// ouvert à toute l'équipe (Gérant/Cuisine/Service), pas réservé au
// Gérant comme le reste de la Phase 7 — c'est l'équipe de terrain qui
// ferme le service et coche la checklist, pas le pilotage.
// ============================================================

const COMPLETION_INCLUDE = {
  template: { select: { id: true, name: true } },
  completedBy: { select: { id: true, firstName: true, lastName: true } },
  items: { include: { templateItem: { select: { id: true, label: true, order: true } } } },
} as const;

function serializeCompletion(completion: {
  id: string;
  serviceDate: Date;
  completedAt: Date | null;
  createdAt: Date;
  template: { id: string; name: string };
  completedBy: { id: string; firstName: string; lastName: string };
  items: { id: string; isChecked: boolean; checkedAt: Date | null; templateItem: { id: string; label: string; order: number } }[];
}) {
  return {
    id: completion.id,
    serviceDate: completion.serviceDate.toISOString().slice(0, 10),
    completedAt: completion.completedAt,
    createdAt: completion.createdAt,
    template: completion.template,
    completedBy: completion.completedBy,
    items: completion.items
      .slice()
      .sort((a, b) => a.templateItem.order - b.templateItem.order)
      .map((i) => ({ id: i.id, label: i.templateItem.label, isChecked: i.isChecked, checkedAt: i.checkedAt })),
  };
}

export async function listCleaningChecklistCompletions(req: Request, res: Response) {
  const completions = await prisma.cleaningChecklistCompletion.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: COMPLETION_INCLUDE,
    orderBy: { serviceDate: 'desc' },
  });
  res.json({ completions: completions.map(serializeCompletion) });
}

export async function getCleaningChecklistCompletion(req: Request, res: Response) {
  const completion = await prisma.cleaningChecklistCompletion.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    include: COMPLETION_INCLUDE,
  });
  if (!completion) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Checklist introuvable.' });
  }
  res.json({ completion: serializeCompletion(completion) });
}

// Démarre une complétion : une ligne par item du gabarit, toutes non
// cochées — completedAt reste null tant qu'il en manque (voir
// toggleCleaningChecklistCompletionItem).
export async function createCleaningChecklistCompletion(req: Request, res: Response) {
  const input = createCleaningChecklistCompletionSchema.parse(req.body);

  const template = await prisma.cleaningChecklistTemplate.findFirst({
    where: { id: input.templateId, restaurantId: req.user!.restaurantId, isActive: true },
    include: { items: true },
  });
  if (!template) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Modèle de checklist introuvable.' });
  }

  const completion = await prisma.cleaningChecklistCompletion.create({
    data: {
      restaurantId: req.user!.restaurantId,
      templateId: template.id,
      serviceDate: input.serviceDate,
      completedById: req.user!.id,
      items: { create: template.items.map((item) => ({ templateItemId: item.id })) },
    },
    include: COMPLETION_INCLUDE,
  });
  res.status(201).json({ completion: serializeCompletion(completion) });
}

// Coche/décoche un item — completedAt recalculé à chaque appel à
// partir de l'état réel de tous les items (jamais juste posé à `now()`
// sans vérifier les autres) : décocher un item après coup doit annuler
// la complétion, pas la laisser figée à tort.
export async function toggleCleaningChecklistCompletionItem(req: Request, res: Response) {
  const input = toggleCleaningChecklistCompletionItemSchema.parse(req.body);

  const completion = await prisma.cleaningChecklistCompletion.findFirst({
    where: { id: req.params.completionId, restaurantId: req.user!.restaurantId },
    include: { items: true },
  });
  if (!completion) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Checklist introuvable.' });
  }
  const targetItem = completion.items.find((i) => i.id === req.params.itemId);
  if (!targetItem) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Élément introuvable.' });
  }

  await prisma.cleaningChecklistCompletionItem.update({
    where: { id: targetItem.id },
    data: { isChecked: input.isChecked, checkedAt: input.isChecked ? new Date() : null },
  });

  const allChecked = completion.items.every((i) => (i.id === targetItem.id ? input.isChecked : i.isChecked));
  const updated = await prisma.cleaningChecklistCompletion.update({
    where: { id: completion.id },
    data: { completedAt: allChecked ? (completion.completedAt ?? new Date()) : null },
    include: COMPLETION_INCLUDE,
  });

  res.json({ completion: serializeCompletion(updated) });
}
