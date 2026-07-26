// Gestion centralisée des erreurs — exigence explicite du prompt
// d'origine : "codes HTTP cohérents, messages exploitables côté front".
// Toutes les routes passent par ici en cas d'erreur (via asyncHandler
// ou une erreur synchrone), un seul endroit à maintenir.

import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { logger } from '../lib/logger';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Erreur Multer (upload de facture) : un fichier trop volumineux
  // lève cette erreur de façon synchrone, avant même d'atteindre le
  // contrôleur — sans ce cas, elle tombait dans le bloc générique
  // "erreur interne" (500, message opaque), alors que c'est une entrée
  // utilisateur invalide comme une autre (400).
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: 'FILE_TOO_LARGE',
        message: 'Le fichier dépasse la taille maximale autorisée (15 Mo).',
      });
      return;
    }
    res.status(400).json({ error: 'UPLOAD_ERROR', message: "Échec de l'envoi du fichier." });
    return;
  }

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
