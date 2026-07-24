// Gestion centralisée des erreurs — exigence explicite du prompt
// d'origine : "codes HTTP cohérents, messages exploitables côté front".
// Toutes les routes passent par ici en cas d'erreur (via asyncHandler
// ou une erreur synchrone), un seul endroit à maintenir.

import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Erreur de validation Zod (corps de requête invalide)
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Les données envoyées ne sont pas valides.',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Erreurs Prisma connues (contrainte unique violée, enregistrement
  // introuvable, etc.) — traduites en réponses HTTP compréhensibles
  // plutôt que de laisser fuiter un message technique de la base.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: 'CONFLICT',
        message: 'Une ressource avec ces informations existe déjà.',
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Ressource introuvable.' });
      return;
    }
  }

  // Tout le reste : erreur interne non anticipée — on logue le détail
  // (pour nous) mais on ne renvoie jamais la stack trace au client.
  logger.error({ err, path: req.path, method: req.method }, 'Erreur non gérée');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue.' });
};
