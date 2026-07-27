// Envoi de commande par SMS (API Twilio) — pour les fournisseurs dont
// le canal préféré est SMS (Supplier.preferredChannel), à côté de
// l'email et du WhatsApp (Phase 4). Même principe de repli que
// email.ts/whatsapp.ts : échoue proprement si la configuration est
// absente/invalide, l'appelant garde la commande en DRAFT et renvoie le
// message généré pour un envoi manuel.

import { env } from '../config/env';

export class SmsError extends Error {}

function looksLikePlaceholder(): boolean {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;
  // Un Account SID Twilio commence toujours par "AC" — un signal fiable
  // de placeholder de test plutôt qu'une vraie valeur.
  return !sid || !sid.startsWith('AC') || !token || !from;
}

export async function sendSms(to: string, text: string): Promise<void> {
  if (looksLikePlaceholder()) {
    throw new SmsError(
      "Identifiants Twilio absents ou invalides (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER) — envoi automatique indisponible.",
    );
  }

  const body = new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER!, Body: text });
  const basicAuth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      // Sans timeout, un Twilio qui ne répond jamais laisserait la
      // requête pendre indéfiniment côté client.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new SmsError(`Appel à l'API Twilio échoué : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw new SmsError(`Twilio a renvoyé une erreur (${response.status}) : ${responseBody}`);
  }
}
