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

// `omit` demanderait d'activer une preview feature sur cette version de
// Prisma — un `select` explicite de tous les champs scalaires sauf
// sourceFileData obtient le même résultat sans configuration
// supplémentaire. Les octets du fichier n'ont aucune raison de voyager
// dans une réponse de liste/détail (potentiellement plusieurs Mo par
// facture) — seul /:id/file en a besoin.
const INVOICE_SCALARS_WITHOUT_FILE = {
  id: true,
  restaurantId: true,
  supplierId: true,
  status: true,
  invoiceDate: true,
  totalAmount: true,
  sourceFileMimeType: true,
  rawExtractionJson: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listInvoices(req: Request, res: Response) {
  const invoices = await prisma.invoice.findMany({
    where: { restaurantId: req.user!.restaurantId },
    select: {
      ...INVOICE_SCALARS_WITHOUT_FILE,
      supplier: { select: { id: true, name: true } },
      lineItems: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ invoices });
}

export async function getInvoice(req: Request, res: Response) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    select: {
      ...INVOICE_SCALARS_WITHOUT_FILE,
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
// Stocké en base (sourceFileData), pas sur le disque du conteneur : le
// service backend n'a aucun volume persistant attaché, un fichier écrit
// sur disque serait perdu au prochain redéploiement.
export async function getInvoiceFile(req: Request, res: Response) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    select: { sourceFileData: true, sourceFileMimeType: true },
  });
  if (!invoice) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Facture introuvable.' });
  }
  res.setHeader('Content-Type', invoice.sourceFileMimeType);
  res.send(invoice.sourceFileData);
}

// Upload d'une facture (PDF/JPG/PNG) : vérifie le type réel du fichier
// via ses magic bytes (jamais le Content-Type déclaré par le client, ni
// l'extension), le stocke en base, puis tente l'extraction automatique
// via l'API Claude. En cas d'échec de l'extraction (clé API
// absente/invalide, quota, réponse mal formée...), la facture passe en
// statut ERROR mais reste exploitable : l'utilisateur peut saisir les
// lignes manuellement (repli explicitement demandé par le plan).
// Extrait de uploadInvoice pour être testable directement — comme
// subscriptionToRestaurantUpdate (billing.controller.ts), aucune vraie
// clé ANTHROPIC_API_KEY n'existe dans cet environnement, impossible de
// tester ce filtrage via un vrai appel à extractInvoiceData().
//
// `extractInvoiceData` ne fait qu'un cast TypeScript (compile-time) sur
// la réponse de Claude — aucune garantie runtime. Contrairement à une
// ligne saisie/éditée à la main (POST/PATCH .../lines), qui passe
// toujours par createInvoiceLineSchema, une ligne extraite par l'IA
// n'était jusqu'ici jamais revalidée : une ligne de remise mal
// interprétée ("Remise fidélité -5,00 €") pouvait entrer en base avec
// un prix négatif, qui aurait fini dans PriceHistory (jamais protégée
// par le garde-fou de validateInvoice, contrairement à
// Product.currentPriceHT) et dans le total de la facture — donc dans
// le rapport mensuel et l'export comptable. Une ligne rejetée ici
// n'est pas perdue pour de bon : elle manque simplement à la relecture
// humaine, qui peut l'ajouter à la main (repli déjà prévu par le
// design pour toute donnée que l'OCR ne restitue pas bien).
export function filterValidExtractedLines(lines: { rawLabel: string; quantity: number; unitPriceHT: number; totalPriceHT: number }[]): {
  validLines: { rawLabel: string; quantity: number; unitPriceHT: number; totalPriceHT: number }[];
  rejectedCount: number;
} {
  const validLines: { rawLabel: string; quantity: number; unitPriceHT: number; totalPriceHT: number }[] = [];
  let rejectedCount = 0;
  for (const line of lines) {
    const result = createInvoiceLineSchema.safeParse(line);
    if (result.success) {
      validLines.push({
        rawLabel: result.data.rawLabel,
        quantity: result.data.quantity,
        unitPriceHT: result.data.unitPriceHT,
        totalPriceHT: result.data.totalPriceHT,
      });
    } else {
      rejectedCount += 1;
    }
  }
  return { validLines, rejectedCount };
}

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

  const invoice = await prisma.invoice.create({
    data: {
      restaurantId: req.user!.restaurantId,
      supplierId,
      sourceFileData: req.file.buffer,
      sourceFileMimeType: fileType,
      status: 'PROCESSING',
    },
    select: INVOICE_SCALARS_WITHOUT_FILE,
  });

  try {
    const extracted = await extractInvoiceData(req.file.buffer, fileType);
    const { validLines, rejectedCount } = filterValidExtractedLines(extracted.lines);

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'PENDING_REVIEW',
        invoiceDate: extracted.invoiceDate ? new Date(extracted.invoiceDate) : undefined,
        totalAmount: extracted.totalAmount ?? undefined,
        rawExtractionJson: extracted as unknown as object,
        lineItems: { create: validLines },
      },
      select: { ...INVOICE_SCALARS_WITHOUT_FILE, lineItems: true },
    });
    if (rejectedCount > 0) {
      logger.warn(
        { invoiceId: invoice.id, rejectedCount, totalExtracted: extracted.lines.length },
        "Facture importée avec des lignes manquantes : rejetées par validation (donnée invalide extraite par l'IA)",
      );
    }
    return res.status(201).json({ invoice: updated });
  } catch (err) {
    const message =
      err instanceof InvoiceExtractionError ? err.message : "Échec inattendu de l'extraction automatique.";
    logger.warn({ err, invoiceId: invoice.id }, 'Extraction de facture échouée — repli sur la saisie manuelle');
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'ERROR', errorMessage: message },
      select: INVOICE_SCALARS_WITHOUT_FILE,
    });
    return res.status(201).json({ invoice: updated });
  }
}

// Une facture VALIDATED a déjà nourri PriceHistory, mis à jour
// Product.currentPriceHT et potentiellement généré des MarginAlert —
// la modifier après coup (fournisseur, lignes) désynchroniserait
// silencieusement ces données déjà figées, y compris le montant déjà
// arrêté dans invoice.totalAmount (jamais recalculé après validation).
// Même principe que le garde-fou déjà en place sur validateInvoice
// elle-même (double-validation).
const INVOICE_LOCKED_MESSAGE = {
  error: 'INVOICE_VALIDATED',
  message: 'Cette facture est déjà validée et ne peut plus être modifiée.',
} as const;

export async function patchInvoice(req: Request, res: Response) {
  const input = patchInvoiceSchema.parse(req.body);

  const existing = await prisma.invoice.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Facture introuvable.' });
  }
  if (existing.status === 'VALIDATED') {
    return res.status(409).json(INVOICE_LOCKED_MESSAGE);
  }

  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, restaurantId: req.user!.restaurantId },
    });
    if (!supplier) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Fournisseur introuvable.' });
    }
  }

  const invoice = await prisma.invoice.update({
    where: { id: existing.id },
    data: input,
    select: INVOICE_SCALARS_WITHOUT_FILE,
  });
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
  if (invoice.status === 'VALIDATED') {
    return res.status(409).json(INVOICE_LOCKED_MESSAGE);
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
    include: { invoice: { select: { status: true } } },
  });
  if (!line) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Ligne de facture introuvable.' });
  }
  if (line.invoice.status === 'VALIDATED') {
    return res.status(409).json(INVOICE_LOCKED_MESSAGE);
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
    include: { invoice: { select: { status: true } } },
  });
  if (!line) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Ligne de facture introuvable.' });
  }
  if (line.invoice.status === 'VALIDATED') {
    return res.status(409).json(INVOICE_LOCKED_MESSAGE);
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
  // Sans ce garde-fou, valider deux fois la même facture (double-clic,
  // requête réseau rejouée) recréerait un historique de prix et
  // recalculerait les alertes à chaque appel — la validation doit être
  // un aller simple.
  if (invoice.status === 'VALIDATED') {
    return res.status(409).json({ error: 'ALREADY_VALIDATED', message: 'Cette facture a déjà été validée.' });
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

      // Une ligne à 0 € (article offert par le fournisseur, geste
      // commercial — nonnegative() l'autorise volontairement sur les
      // lignes de facture, voir invoice.schemas.ts) ou négative (erreur
      // d'extraction OCR/de saisie) reste enregistrée telle quelle dans
      // PriceHistory — c'est ce que dit la facture — mais ne doit jamais
      // devenir LE prix catalogue du produit : ça sous-évaluerait
      // silencieusement le coût matière, donc gonflerait la marge
      // affichée, de tous les plats qui l'utilisent.
      if (newPrice > 0) {
        await tx.product.update({ where: { id: product.id }, data: { currentPriceHT: newPrice } });
      }

      if (previousPrice > 0 && newPrice > 0) {
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
    select: {
      ...INVOICE_SCALARS_WITHOUT_FILE,
      lineItems: true,
      supplier: { select: { id: true, name: true } },
    },
  });

  res.json({ invoice: updated, alertsGenerated: alerts });
}
