// Limitation de débit sur les points d'entrée sensibles (authentification,
// création de compte). Sans ça, rien n'empêche un script d'essayer des
// milliers de mots de passe par minute sur /api/auth/login — argon2 rend
// chaque tentative coûteuse en CPU mais ne bloque jamais la répétition.

import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Nos tests d'intégration appellent légitimement /login et /bootstrap des
// dizaines de fois dans la même fenêtre — sans ce garde-fou, la suite de
// tests se bloquerait elle-même. Vitest force NODE_ENV=test avant même le
// chargement de .env (vérifié empiriquement), donc ce n'est jamais vrai
// en production.
const skipInTests = () => env.NODE_ENV === 'test';

// Connexion : la protection anti brute-force la plus importante. Limite
// par IP (pas par email) pour ne pas transformer ce garde-fou en un
// moyen de bloquer le compte d'un tiers rien qu'en connaissant son email.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' },
});

// Création de restaurant : point d'entrée public (avant tout compte),
// donc la seule protection possible contre la création massive de faux
// comptes est la limitation par IP.
export const bootstrapRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Trop de créations de compte depuis cette adresse. Réessayez plus tard.' },
});

// Mot de passe oublié : point d'entrée public, à la fois cible
// d'énumération d'emails (deviner quelles adresses ont un compte) et de
// spam (harceler une boîte mail de liens de réinitialisation).
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Trop de demandes. Réessayez plus tard.' },
});

export const resetPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Réessayez plus tard.' },
});
