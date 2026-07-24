// Middleware d'authentification : vérifie l'access token JWT envoyé
// dans l'en-tête "Authorization: Bearer <token>" et attache l'identité
// (id, restaurantId, role) à req.user pour que les routes suivantes
// puissent l'utiliser — notamment pour le filtrage multi-tenant
// (toujours filtrer par req.user.restaurantId, jamais faire confiance
// à un restaurantId envoyé dans le corps de la requête par le client).

import type { RequestHandler } from 'express';
import type { UserRole } from '@prisma/client';
import { verifyAccessToken } from '../utils/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        restaurantId: string;
        role: UserRole;
      };
    }
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Token manquant.' });
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, restaurantId: payload.restaurantId, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Token invalide ou expiré.' });
  }
};
