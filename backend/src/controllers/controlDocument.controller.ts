import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createControlDocumentSchema, controlOrganismSchema } from '../schemas/controlDocument.schemas';
import { detectFileType, ALLOWED_INVOICE_FILE_TYPES } from '../lib/fileType';
import { fetchEmployeeHoursSummary, minutesToDecimalHours } from './hoursSummary.controller';

const LIST_FIELDS = {
  id: true,
  organism: true,
  category: true,
  label: true,
  fileMimeType: true,
  uploadedAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

export async function listControlDocuments(req: Request, res: Response) {
  const organism = req.query.organism ? controlOrganismSchema.parse(req.query.organism) : undefined;
  const documents = await prisma.controlDocument.findMany({
    where: { restaurantId: req.user!.restaurantId, ...(organism ? { organism } : {}) },
    select: LIST_FIELDS,
    orderBy: { uploadedAt: 'desc' },
  });
  res.json({ documents });
}

// Sert le fichier séparément de la liste — route authentifiée, jamais
// un dossier statique public, même principe que getInvoiceFile.
export async function getControlDocumentFile(req: Request, res: Response) {
  const document = await prisma.controlDocument.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    select: { fileData: true, fileMimeType: true },
  });
  if (!document) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Document introuvable.' });
  }
  res.setHeader('Content-Type', document.fileMimeType);
  res.send(document.fileData);
}

export async function createControlDocument(req: Request, res: Response) {
  const input = createControlDocumentSchema.parse(req.body);

  if (!req.file) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Aucun fichier reçu.' });
  }
  const fileType = detectFileType(req.file.buffer);
  if (!fileType || !ALLOWED_INVOICE_FILE_TYPES.includes(fileType)) {
    return res.status(400).json({
      error: 'INVALID_FILE_TYPE',
      message: 'Type de fichier non pris en charge. Seuls les PDF, JPG et PNG sont acceptés.',
    });
  }

  const document = await prisma.controlDocument.create({
    data: {
      restaurantId: req.user!.restaurantId,
      organism: input.organism,
      category: input.category,
      label: input.label,
      fileData: req.file.buffer,
      fileMimeType: fileType,
      uploadedById: req.user!.id,
    },
    select: LIST_FIELDS,
  });
  res.status(201).json({ document });
}

export async function deleteControlDocument(req: Request, res: Response) {
  const existing = await prisma.controlDocument.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Document introuvable.' });
  }
  await prisma.controlDocument.delete({ where: { id: existing.id } });
  res.status(204).send();
}

// Le "dossier" présenté au restaurateur (décision 7.0) : les documents
// déposés pour cet organisme + les données déjà en base ailleurs quand
// pertinent — jamais dupliquées, toujours recalculées à la lecture.
// URSSAF/Inspection du travail : récapitulatif d'heures (Planning).
// DDPP : historique des checklists de nettoyage (Hygiène). DGCCRF/
// DGFiP : documents déposés uniquement, aucune donnée auto-tirée
// pertinente identifiée en 7.0.
export async function getControlDossier(req: Request, res: Response) {
  const organism = controlOrganismSchema.parse(req.params.organism);

  const documents = await prisma.controlDocument.findMany({
    where: { restaurantId: req.user!.restaurantId, organism },
    select: LIST_FIELDS,
    orderBy: { uploadedAt: 'desc' },
  });

  let periodStart = req.query.periodStart ? new Date(req.query.periodStart as string) : undefined;
  let periodEnd = req.query.periodEnd ? new Date(req.query.periodEnd as string) : undefined;
  if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    const now = new Date();
    periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  }

  let hoursSummary: { firstName: string; lastName: string; totalHours: string }[] | undefined;
  let cleaningHistory: { id: string; templateName: string; serviceDate: string; completedAt: string | null }[] | undefined;

  if (organism === 'URSSAF' || organism === 'INSPECTION_TRAVAIL') {
    const summaries = await fetchEmployeeHoursSummary(req.user!.restaurantId, periodStart, periodEnd);
    hoursSummary = summaries.map((s) => ({
      firstName: s.firstName,
      lastName: s.lastName,
      totalHours: minutesToDecimalHours(s.totalMinutes),
    }));
  }

  if (organism === 'DDPP') {
    const completions = await prisma.cleaningChecklistCompletion.findMany({
      where: {
        restaurantId: req.user!.restaurantId,
        serviceDate: { gte: periodStart, lte: periodEnd },
      },
      include: { template: { select: { name: true } } },
      orderBy: { serviceDate: 'desc' },
    });
    cleaningHistory = completions.map((c) => ({
      id: c.id,
      templateName: c.template.name,
      serviceDate: c.serviceDate.toISOString().slice(0, 10),
      completedAt: c.completedAt ? c.completedAt.toISOString() : null,
    }));
  }

  res.json({
    organism,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    documents,
    hoursSummary,
    cleaningHistory,
  });
}
