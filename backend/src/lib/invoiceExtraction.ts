// Extraction des données d'une facture (fournisseur, date, montant,
// lignes produits) via l'API Claude (vision). Isolé dans son propre
// module pour deux raisons : (1) permettre de mocker l'appel réseau
// dans les tests (voir invoice.integration.test.ts), (2) pouvoir
// échouer proprement — pas de clé API valide, quota dépassé, réponse
// mal formée — sans jamais faire planter le serveur : l'appelant
// (invoice.controller.ts) bascule la facture en statut ERROR et laisse
// l'utilisateur saisir les lignes manuellement (repli explicitement
// demandé par le plan).

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import type { DetectedFileType } from './fileType';

export class InvoiceExtractionError extends Error {}

export interface ExtractedInvoiceLine {
  rawLabel: string;
  quantity: number;
  unitPriceHT: number;
  totalPriceHT: number;
}

export interface ExtractedInvoiceData {
  supplierNameGuess: string | null;
  invoiceDate: string | null; // ISO 8601 (YYYY-MM-DD), ou null si illisible
  totalAmount: number | null;
  lines: ExtractedInvoiceLine[];
}

const EXTRACTION_TOOL_NAME = 'record_invoice_data';

const EXTRACTION_TOOL = {
  name: EXTRACTION_TOOL_NAME,
  description: "Enregistre les données extraites d'une facture fournisseur pour un restaurant.",
  input_schema: {
    type: 'object' as const,
    properties: {
      supplierNameGuess: { type: ['string', 'null'], description: 'Nom du fournisseur tel que lu sur la facture.' },
      invoiceDate: { type: ['string', 'null'], description: 'Date de la facture au format YYYY-MM-DD.' },
      totalAmount: { type: ['number', 'null'], description: 'Montant total TTC de la facture.' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rawLabel: { type: 'string', description: 'Libellé du produit tel qu\'écrit sur la facture.' },
            quantity: { type: 'number' },
            unitPriceHT: { type: 'number', description: 'Prix unitaire HT.' },
            totalPriceHT: { type: 'number', description: 'Prix total HT de la ligne.' },
          },
          required: ['rawLabel', 'quantity', 'unitPriceHT', 'totalPriceHT'],
        },
      },
    },
    required: ['supplierNameGuess', 'invoiceDate', 'totalAmount', 'lines'],
  },
};

function looksLikePlaceholder(key: string | undefined): boolean {
  return !key || key.length < 20 || !key.startsWith('sk-ant-');
}

export async function extractInvoiceData(
  fileBuffer: Buffer,
  fileType: DetectedFileType,
): Promise<ExtractedInvoiceData> {
  if (looksLikePlaceholder(env.ANTHROPIC_API_KEY)) {
    throw new InvoiceExtractionError(
      "Clé API Claude absente ou invalide (ANTHROPIC_API_KEY) — extraction automatique indisponible.",
    );
  }
  if (!fileType) {
    throw new InvoiceExtractionError('Type de fichier non pris en charge pour l\'extraction.');
  }

  // Le SDK a par défaut un timeout de 10 minutes — bien plus que ce
  // qu'une extraction de facture devrait jamais légitimement prendre,
  // resserré pour éviter de laisser un upload pendre trop longtemps
  // côté utilisateur en cas de panne de l'API.
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 60_000 });
  const base64Data = fileBuffer.toString('base64');

  const documentBlock =
    fileType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: fileType, data: base64Data } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: fileType, data: base64Data } };

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            documentBlock,
            {
              type: 'text',
              text: "Voici une facture fournisseur pour un restaurant. Extrais le nom du fournisseur, la date, le montant total, et chaque ligne produit (libellé, quantité, prix unitaire HT, prix total HT) via l'outil fourni.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    throw new InvoiceExtractionError(
      `Appel à l'API Claude échoué : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
    );
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === EXTRACTION_TOOL_NAME,
  );
  if (!toolUse) {
    throw new InvoiceExtractionError("La réponse de l'API Claude ne contient pas les données attendues.");
  }

  return toolUse.input as ExtractedInvoiceData;
}
