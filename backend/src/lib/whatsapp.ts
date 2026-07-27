// Envoi de commande par WhatsApp Business (API Cloud de Meta) — pour
// les fournisseurs dont le canal préféré est WhatsApp
// (Supplier.preferredChannel), plutôt que l'email uniquement (Phase 4).
// Même principe de repli que email.ts : échoue proprement si la
// configuration est absente/invalide, l'appelant (order.controller.ts)
// garde alors la commande en DRAFT et renvoie le message généré pour un
// envoi manuel.

import { env } from '../config/env';

export class WhatsAppError extends Error {}

function looksLikePlaceholder(): boolean {
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  return !token || token.length < 20 || !phoneNumberId;
}

// `to` : numéro du fournisseur (Supplier.contactPhone), au format
// international si possible. L'API attend un numéro sans espaces ni
// symboles ; on normalise ici plutôt que d'imposer un format strict à
// la saisie du fournisseur.
export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (looksLikePlaceholder()) {
    throw new WhatsAppError(
      "Configuration WhatsApp Business absente ou invalide (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) — envoi automatique indisponible.",
    );
  }

  const normalizedTo = to.replace(/[\s+()-]/g, '');

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'text',
        text: { body: text },
      }),
      // Sans timeout, une API Meta qui ne répond jamais laisserait la
      // requête pendre indéfiniment côté client.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new WhatsAppError(
      `Appel à l'API WhatsApp Business échoué : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new WhatsAppError(`WhatsApp Business a renvoyé une erreur (${response.status}) : ${body}`);
  }
}
