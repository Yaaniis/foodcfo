// Valide les variables d'environnement une seule fois, au démarrage du
// serveur. Objectif : si une variable manque ou est mal formée, l'erreur
// est claire et immédiate (au lancement), plutôt qu'une erreur cryptique
// plus tard au moment où la variable est utilisée (comme le
// "Environment variable not found: DATABASE_URL" de Prisma rencontré
// pendant la mise en place du projet).

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis (voir .env.example)'),
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET est requis'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET est requis'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  // Optionnelle : sans clé valide, l'extraction IA des factures (Phase 3)
  // échoue proprement et bascule sur la saisie manuelle assistée, plutôt
  // que d'empêcher le serveur de démarrer.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Optionnelles : sans clé/adresse valide, l'envoi d'email de commande
  // (Phase 4) échoue proprement et le message généré reste disponible
  // pour un envoi manuel, plutôt que d'empêcher le serveur de démarrer.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  // Optionnelles : envoi de commande par WhatsApp Business (Meta Cloud
  // API) — canal préféré de certains fournisseurs (Supplier.preferredChannel),
  // à côté de l'email. Sans clé valide, repli sur le message généré à
  // copier manuellement, même principe que l'email.
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  // Optionnelles : envoi de commande par SMS (Twilio).
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // On affiche un message clair et on arrête le serveur plutôt que de
  // continuer avec une configuration incomplète.
  console.error('❌ Configuration invalide (.env) :');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
