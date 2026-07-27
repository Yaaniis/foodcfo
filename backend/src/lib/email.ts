// Envoi d'email générique via l'API Resend (décision 0.7) — utilisé à
// la fois pour l'envoi de commandes (Phase 4) et le rapport mensuel
// automatique (Phase 6). Appel HTTP direct (fetch natif) plutôt que le
// SDK `resend` — pas besoin d'une dépendance de plus (même logique que
// apiClient.ts côté frontend). Isolé dans son propre module pour
// échouer proprement (clé/adresse absente ou invalide, panne réseau,
// refus de l'API) sans jamais faire planter l'appelant.

import { env } from '../config/env';

export class EmailError extends Error {}

function looksLikePlaceholder(): boolean {
  const key = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  return !key || key.length < 20 || !from || from.includes('votre-domaine');
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (looksLikePlaceholder()) {
    throw new EmailError(
      "Clé API Resend ou adresse d'expédition absente/invalide (RESEND_API_KEY / RESEND_FROM_EMAIL) — envoi automatique indisponible.",
    );
  }

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [to], subject, text }),
      // Sans timeout, un Resend qui ne répond jamais laisserait la
      // requête (commande, rapport mensuel...) pendre indéfiniment côté
      // client, sans message d'erreur exploitable.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new EmailError(`Appel à l'API Resend échoué : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new EmailError(`Resend a renvoyé une erreur (${response.status}) : ${body}`);
  }
}
