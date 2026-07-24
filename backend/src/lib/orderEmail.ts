// Envoi de l'email de commande via l'API Resend (décision 0.7). Appel
// HTTP direct (fetch natif) plutôt que le SDK `resend` — un seul appel,
// pas besoin d'une dépendance de plus (même logique que apiClient.ts
// côté frontend). Isolé dans son propre module pour échouer proprement
// (clé/adresse absente ou invalide, panne réseau, refus de l'API) sans
// jamais faire planter la commande : l'appelant (order.controller.ts)
// garde la commande en DRAFT et renvoie le message généré pour un envoi
// manuel, exactement le même principe de repli que pour les factures
// (Phase 3).

import { env } from '../config/env';

export class OrderEmailError extends Error {}

function looksLikePlaceholder(): boolean {
  const key = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  return !key || key.length < 20 || !from || from.includes('votre-domaine');
}

export async function sendOrderEmail(to: string, subject: string, text: string): Promise<void> {
  if (looksLikePlaceholder()) {
    throw new OrderEmailError(
      "Clé API Resend ou adresse d'expédition absente/invalide (RESEND_API_KEY / RESEND_FROM_EMAIL) — envoi automatique indisponible.",
    );
  }

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [to], subject, text }),
    });
  } catch (err) {
    throw new OrderEmailError(
      `Appel à l'API Resend échoué : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new OrderEmailError(`Resend a renvoyé une erreur (${response.status}) : ${body}`);
  }
}
