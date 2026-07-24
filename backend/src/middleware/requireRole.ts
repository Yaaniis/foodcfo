// Gestion des permissions par rôle (décision 0.5 : 3 rôles simples —
// GERANT, CUISINE, SERVICE). S'utilise après requireAuth :
//
//   router.delete('/menu-items/:id', requireAuth, requireRole('GERANT'), handler)
//
// Chaque endpoint métier déclarera explicitement les rôles autorisés au
// fil des Phases 2 à 6 — ce middleware est le mécanisme générique, pas
// encore branché sur des routes métier à ce stade (Phase 1.3 = socle).

import type { RequestHandler } from 'express';
import type { UserRole } from '@prisma/client';

export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Non authentifié.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: "Vous n'avez pas les droits nécessaires pour effectuer cette action.",
      });
      return;
    }
    next();
  };
}
