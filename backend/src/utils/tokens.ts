// Génération et vérification des tokens JWT.
//
// Deux types de tokens (comme demandé dans le prompt d'origine) :
// - access token : courte durée de vie, envoyé à chaque requête API,
//   contient l'identité + le rôle + le restaurant (pour le multi-tenant).
// - refresh token : longue durée de vie, sert uniquement à obtenir un
//   nouvel access token. Stocké en base (RefreshToken) sous forme de
//   hash — jamais en clair — pour pouvoir le révoquer individuellement.

import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // id de l'utilisateur
  restaurantId: string;
  role: UserRole;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): string {
  // jti (JWT ID) aléatoire : sans lui, deux connexions du même
  // utilisateur survenant dans la même seconde produiraient un JWT
  // strictement identique (la signature HS256 est déterministe et
  // l'horodatage JWT n'a qu'une précision à la seconde), ce qui ferait
  // échouer l'enregistrement en base (contrainte d'unicité sur le hash
  // du token). Bug réel détecté via les tests d'intégration (Phase 1.6).
  return jwt.sign({ sub: userId, jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
}

// On ne stocke jamais le refresh token en clair en base (si la base
// fuitait, un attaquant ne doit pas pouvoir réutiliser les tokens tels
// quels). Un hash simple suffit ici : contrairement à un mot de passe,
// le refresh token est déjà un secret à haute entropie généré par nous,
// pas besoin de sel/coût argon2, juste d'un hash pour la recherche.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Convertit une durée façon JWT ("15m", "7d", "1h") en date d'expiration
// absolue, pour l'enregistrement en base (RefreshToken.expiresAt).
export function expiryDateFromDuration(duration: string): Date {
  const match = /^(\d+)([smhd])$/.exec(duration);
  const DAY_MS = 86_400_000;
  if (!match) {
    // Format non reconnu : on retombe sur 7 jours plutôt que de planter.
    return new Date(Date.now() + 7 * DAY_MS);
  }
  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers: Record<typeof unit, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: DAY_MS,
  };
  return new Date(Date.now() + value * multipliers[unit]);
}
