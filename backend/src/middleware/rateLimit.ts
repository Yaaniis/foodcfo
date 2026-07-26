// Limitation de débit sur les points d'entrée sensibles (authentification,
// création de compte). Sans ça, rien n'empêche un script d'essayer des
// milliers de mots de passe par minute sur /api/auth/login — argon2 rend
// chaque tentative coûteuse en CPU mais ne bloque jamais la répétition.

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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

// Endpoints authentifiés qui déclenchent un appel à une API tierce
// payante (Claude pour l'extraction de facture, Resend/WhatsApp/Twilio
// pour l'envoi) — aucune clé réelle n'est configurée à ce jour, donc
// aucun coût actif, mais mieux vaut ce garde-fou en place avant que
// l'utilisateur ajoute ses vraies clés plutôt qu'après coup. Limité par
// restaurant (pas par IP) : c'est le tenant dont l'usage doit être
// borné, pas le réseau depuis lequel il se connecte — un bureau
// partageant une IP ne doit pas être pénalisé par l'activité d'un autre
// restaurant.
function keyByRestaurant(req: import('express').Request): string {
  // ipKeyGenerator (pas req.ip brut) : normalise les adresses IPv6 par
  // sous-réseau plutôt que par adresse exacte — sinon express-rate-limit
  // lève ERR_ERL_KEY_GEN_IPV6 (repli non sûr vis-à-vis d'IPv6, détecté
  // en conditions réelles). Ce repli ne devrait jamais s'exercer en
  // pratique (ces routes sont toujours derrière requireAuth), mais reste
  // correct si jamais req.user était absent.
  return req.user?.restaurantId ?? ipKeyGenerator(req.ip ?? '');
}

export const invoiceUploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  keyGenerator: keyByRestaurant,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Trop de factures envoyées récemment. Réessayez plus tard.' },
});

export const orderSendRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  keyGenerator: keyByRestaurant,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Trop de commandes envoyées récemment. Réessayez plus tard.' },
});

export const reportSendRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  keyGenerator: keyByRestaurant,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Trop de rapports envoyés récemment. Réessayez plus tard.' },
});

// Changement de mot de passe (utilisateur déjà connecté) : protège
// contre un attaquant en possession d'un access token volé qui
// tenterait de deviner le mot de passe actuel par force brute (requis
// avant d'accepter le nouveau).
export const changePasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  keyGenerator: keyByRestaurant,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Réessayez plus tard.' },
});
