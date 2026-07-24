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
