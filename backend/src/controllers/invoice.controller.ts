import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { detectFileType, ALLOWED_INVOICE_FILE_TYPES } from '../lib/fileType';
import { extractInvoiceData, InvoiceExtractionError } from '../lib/invoiceExtraction';
import {
  patchInvoiceSchema,
  createInvoiceLineSchema,
  updateInvoiceLineSchema,
} from '../schemas/invoice.schemas';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'invoices');

export async function listInvoices(req: Request, res: Response) {
  const invoices = await prisma.invoice.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: { supplier: { select: { id: true, name: true } }, lineItems: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ invoices });
}

export async function getInvoice(req: Request, res: Response) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    include: {
      supplier: { select: { id: true, name: true } },
      lineItems: { include: { product: { select: { id: true, name: true, unit: true } } } },
    },
  });
  if (!invoice) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Facture introuvable.' });
  }
  res.json({ invoice });
}

// Sert le fichier source de la facture — en passant par une route
// authentifiée (plutôt qu'un dossier statique public) pour ne jamais
// exposer les factures d'un restaurant à qui que ce soit d'autre.
export async function getInvoiceFile(req: Request, res: Response) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!invoice) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Facture introuvable.' });
  }
  const filePath = path.join(process.cwd(), invoice.sourceFileUrl);
  const buffer = await readFile(filePath);
  const fileType = detectFileType(buffer);
  res.setHeader('Content-Type', fileType ?? 'application/octet-stream');
  res.send(buffer);
}

// Upload d'une facture (PDF/JPG/PNG) : vérifie le type réel du fichier
// via ses magic bytes (jamais le Content-Type déclaré par le client, ni
// l'extension), le stocke sur disque, puis tente l'extraction
// automatique via l'API Claude. En cas d'échec de l'extraction (clé API
// absente/invalide, quota, réponse mal formée...), la facture passe en
// statut ERROR mais reste exploitable : l'utilisateur peut saisir les
// lignes manuellement (repli explicitement demandé par le plan).
export async function uploadInvoice(req: Request, res: Response) {
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

  let supplierId: string | null = null;
  if (typeof req.body.supplierId === 'string' && req.body.supplierId.length > 0) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.body.supplierId, restaurantId: req.user!.restaurantId },
    });
    if (!supplier) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Fournisseur introuvable.' });
    }
    supplierId = supplier.id;
  }

  await mkdir(UPLOADS_DIR, { recursive: true });
  const extension = fileType === 'application/pdf' ? 'pdf' : fileType === 'image/png' ? 'png' : 'jpg';
  const fileName = `${randomUUID()}.${extension}`;
  const absolutePath = path.join(UPLOADS_DIR, fileName);
  await writeFile(absolutePath, req.file.buffer);
  const relativePath = path.join('uploads', 'invoices', fileName);

  const invoice = await prisma.invoice.create({
    data: {
      restaurantId: req.user!.restaurantId,
      supplierId,
      sourceFileUrl: relativePath,
      status: 'PROCESSING',
    },
  });

  try {
    const extracted = await extractInvoiceData(req.file.buffer, fileType);
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'PENDING_REVIEW',
        invoiceDate: extracted.invoiceDate ? new Date(extracted.invoiceDate) : undefined,
        totalAmount: extracted.totalAmount ?? undefined,
        rawExtractionJson: extracted as unknown as object,
        lineItems: {
          create: extracted.lines.map((line) => ({
            rawLabel: line.rawLabel,
            quantity: line.quantity,
            unitPriceHT: line.unitPriceHT,
            totalPriceHT: line.totalPriceHT,
          })),
        },
      },
      include: { lineItems: true },
    });
    return res.status(201).json({ invoice: updated });
  } catch (err) {
    const message =
      err instanceof InvoiceExtractionError ? err.message : "Échec inattendu de l'extraction automatique.";
    logger.warn({ err, invoiceId: invoice.id }, 'Extraction de facture échouée — repli sur la saisie manuelle');
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'ERROR', errorMessage: message },
    });
    return res.status(201).json({ invoice: updated });
  }
}

export async function patchInvoice(req: Request, res: Response) {
  const input = patchInvoiceSchema.parse(req.body);

  const existing = await prisma.invoice.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Facture introuvable.' });
  }

  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, restaurantId: req.user!.restaurantId },
    });
    if (!supplier) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Fournisseur introuvable.' });
    }
  }

  const invoice = await prisma.invoice.update({ where: { id: existing.id }, data: input });
  res.json({ invoice });
}

export async function addInvoiceLine(req: Request, res: Response) {
  const input = createInvoiceLineSchema.parse(req.body);

  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!invoice) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Facture introuvable.' });
  }

  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, restaurantId: req.user!.restaurantId },
    });
    if (!product) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Produit introuvable.' });
    }
  }

  const line = await prisma.invoiceLineItem.create({
    data: { invoiceId: invoice.id, ...input, wasManuallyEdited: true },
  });
  res.status(201).json({ line });
}

export async function updateInvoiceLine(req: Request, res: Response) {
  const input = updateInvoiceLineSchema.parse(req.body);

  const line = await prisma.invoiceLineItem.findFirst({
    where: { id: req.params.lineId, invoice: { id: req.params.id, restaurantId: req.user!.restaurantId } },
  });
  if (!line) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Ligne de facture introuvable.' });
  }

  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, restaurantId: req.user!.restaurantId },
    });
    if (!product) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Produit introuvable.' });
    }
  }

  const updated = await prisma.invoiceLineItem.update({
    where: { id: line.id },
    data: { ...input, wasManuallyEdited: true },
  });
  res.json({ line: updated });
}

export async function deleteInvoiceLine(req: Request, res: Response) {
  const line = await prisma.invoiceLineItem.findFirst({
    where: { id: req.params.lineId, invoice: { id: req.params.id, restaurantId: req.user!.restaurantId } },
  });
  if (!line) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Ligne de facture introuvable.' });
  }
  await prisma.invoiceLineItem.delete({ where: { id: line.id } });
  res.status(204).send();
}

// Valide définitivement la facture : chaque ligne doit être rapprochée
// d'un produit du catalogue (sinon impossible de savoir quel prix
// mettre à jour). Pour chaque ligne : nouvelle entrée d'historique de
// prix, mise à jour du prix courant du produit, et génération d'une
// alerte si la hausse dépasse le seuil configuré du restaurant.
export async function validateInvoice(req: Request, res: Response) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    include: { lineItems: true },
  });
  if (!invoice) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Facture introuvable.' });
  }
  if (!invoice.supplierId) {
    return res
      .status(400)
      .json({ error: 'MISSING_SUPPLIER', message: 'Un fournisseur doit être associé à la facture avant validation.' });
  }
  if (invoice.lineItems.length === 0) {
    return res.status(400).json({ error: 'NO_LINES', message: 'La facture ne contient aucune ligne.' });
  }
  const unmatchedLine = invoice.lineItems.find((l) => !l.productId);
  if (unmatchedLine) {
    return res.status(400).json({
      error: 'UNMATCHED_LINE',
      message: `La ligne "${unmatchedLine.rawLabel}" n'est rapprochée d'aucun produit du catalogue.`,
    });
  }

  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: req.user!.restaurantId },
    select: { priceIncreaseAlertThreshold: true },
  });
  const alertThreshold = Number(restaurant.priceIncreaseAlertThreshold);

  const alerts: { productName: string; previousPrice: number; newPrice: number; increasePercent: number }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const line of invoice.lineItems) {
      const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId! } });
      const previousPrice = Number(product.currentPriceHT);
      const newPrice = Number(line.unitPriceHT);

      await tx.priceHistory.create({
        data: {
          productId: product.id,
          supplierId: invoice.supplierId!,
          priceHT: newPrice,
          invoiceId: invoice.id,
        },
      });

      await tx.product.update({ where: { id: product.id }, data: { currentPriceHT: newPrice } });

      if (previousPrice > 0) {
        const increasePercent = ((newPrice - previousPrice) / previousPrice) * 100;
        if (increasePercent > alertThreshold) {
          alerts.push({ productName: product.name, previousPrice, newPrice, increasePercent });
          await tx.marginAlert.create({
            data: {
              restaurantId: req.user!.restaurantId,
              type: 'SUPPLIER_PRICE_INCREASE',
              thresholdValue: alertThreshold,
              currentValue: increasePercent,
              message: `Le prix de "${product.name}" a augmenté de ${increasePercent.toFixed(1)} % (${previousPrice.toFixed(2)} € → ${newPrice.toFixed(2)} € HT).`,
            },
          });
        }
      }
    }

    // Une facture validée sans date ni montant n'a pas de sens pour la
    // comptabilité (Phase 6 : export CSV, rapport mensuel, tous deux
    // filtrés/agrégés par date) — on comble ces deux champs à la
    // validation s'ils n'ont pas été renseignés (extraction IA ratée,
    // saisie manuelle incomplète), plutôt que de les laisser vides.
    const totalPriceHT = invoice.lineItems.reduce((sum, l) => sum + Number(l.totalPriceHT), 0);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'VALIDATED',
        invoiceDate: invoice.invoiceDate ?? new Date(),
        totalAmount: invoice.totalAmount ?? totalPriceHT,
      },
    });
  });

  const updated = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoice.id },
    include: { lineItems: true, supplier: { select: { id: true, name: true } } },
  });

  res.json({ invoice: updated, alertsGenerated: alerts });
}
