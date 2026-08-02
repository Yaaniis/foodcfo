import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createHygieneReferenceItemSchema, updateHygieneReferenceItemSchema } from '../schemas/hygieneReferenceItem.schemas';
import { detectFileType, ALLOWED_HYGIENE_MEDIA_TYPES } from '../lib/fileType';

const LIST_FIELDS = {
  id: true,
  title: true,
  content: true,
  mediaMimeType: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serialize(item: { id: string; title: string; content: string; mediaMimeType: string | null; createdAt: Date; updatedAt: Date }) {
  return { ...item, hasMedia: item.mediaMimeType !== null };
}

// Lecture ouverte à toute l'équipe (Gérant/Cuisine/Service) : ce sont
// des rappels destinés à tout le monde, pas une donnée de pilotage —
// écriture réservée au Gérant (voir hygiene.routes.ts), contenu fourni
// par le restaurateur, jamais généré.
export async function listHygieneReferenceItems(req: Request, res: Response) {
  const items = await prisma.hygieneReferenceItem.findMany({
    where: { restaurantId: req.user!.restaurantId },
    select: LIST_FIELDS,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ referenceItems: items.map(serialize) });
}

// Sert le média (image) séparément de la liste, comme
// getInvoiceFile — jamais inliné en base64 dans le JSON de liste, qui
// serait alors énorme et lent à charger pour rien (l'écran de liste
// n'a besoin que de la miniature au clic, pas systématiquement).
export async function getHygieneReferenceItemMedia(req: Request, res: Response) {
  const item = await prisma.hygieneReferenceItem.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    select: { mediaData: true, mediaMimeType: true },
  });
  if (!item || !item.mediaData || !item.mediaMimeType) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Média introuvable.' });
  }
  res.setHeader('Content-Type', item.mediaMimeType);
  res.send(item.mediaData);
}

const INVALID_MEDIA = Symbol('INVALID_MEDIA');

function validateOptionalMedia(
  file: Express.Multer.File | undefined,
): { mediaData: Buffer; mediaMimeType: string } | null | typeof INVALID_MEDIA {
  if (!file) return null;
  const fileType = detectFileType(file.buffer);
  if (!fileType || !ALLOWED_HYGIENE_MEDIA_TYPES.includes(fileType)) {
    return INVALID_MEDIA;
  }
  return { mediaData: file.buffer, mediaMimeType: fileType };
}

export async function createHygieneReferenceItem(req: Request, res: Response) {
  const input = createHygieneReferenceItemSchema.parse(req.body);

  const media = validateOptionalMedia(req.file);
  if (media === INVALID_MEDIA) {
    return res.status(400).json({
      error: 'INVALID_FILE_TYPE',
      message: 'Type de fichier non pris en charge. Seuls les JPG et PNG sont acceptés.',
    });
  }

  const item = await prisma.hygieneReferenceItem.create({
    data: {
      restaurantId: req.user!.restaurantId,
      title: input.title,
      content: input.content,
      mediaData: media?.mediaData,
      mediaMimeType: media?.mediaMimeType,
    },
    select: LIST_FIELDS,
  });
  res.status(201).json({ referenceItem: serialize(item) });
}

export async function updateHygieneReferenceItem(req: Request, res: Response) {
  const input = updateHygieneReferenceItemSchema.parse(req.body);

  const existing = await prisma.hygieneReferenceItem.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Rappel introuvable.' });
  }

  const media = validateOptionalMedia(req.file);
  if (media === INVALID_MEDIA) {
    return res.status(400).json({
      error: 'INVALID_FILE_TYPE',
      message: 'Type de fichier non pris en charge. Seuls les JPG et PNG sont acceptés.',
    });
  }

  const item = await prisma.hygieneReferenceItem.update({
    where: { id: existing.id },
    data: {
      title: input.title,
      content: input.content,
      ...(media ? { mediaData: media.mediaData, mediaMimeType: media.mediaMimeType } : {}),
    },
    select: LIST_FIELDS,
  });
  res.json({ referenceItem: serialize(item) });
}

export async function deleteHygieneReferenceItem(req: Request, res: Response) {
  const existing = await prisma.hygieneReferenceItem.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Rappel introuvable.' });
  }
  await prisma.hygieneReferenceItem.delete({ where: { id: existing.id } });
  res.status(204).send();
}
