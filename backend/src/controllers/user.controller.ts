// Gestion des utilisateurs d'un restaurant — réservé au rôle GERANT
// (appliqué via requireRole('GERANT') dans user.routes.ts, pas ici).
//
// Règle d'isolation multi-tenant systématique : toute requête est
// filtrée par req.user.restaurantId, jamais par un restaurantId fourni
// par le client — sinon un Gérant pourrait potentiellement lire/modifier
// les utilisateurs d'un autre restaurant en devinant des identifiants.

import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../utils/password';
import { createUserSchema, updateUserSchema } from '../schemas/user.schemas';

const userPublicFields = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export async function listUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    where: { restaurantId: req.user!.restaurantId },
    select: userPublicFields,
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ users });
}

export async function createUser(req: Request, res: Response) {
  const input = createUserSchema.parse(req.body);

  const existing = await prisma.user.findFirst({
    where: { restaurantId: req.user!.restaurantId, email: input.email },
  });
  if (existing) {
    return res.status(409).json({
      error: 'EMAIL_TAKEN',
      message: 'Un utilisateur avec cet email existe déjà dans ce restaurant.',
    });
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      restaurantId: req.user!.restaurantId,
      email: input.email,
      passwordHash,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
    },
    select: userPublicFields,
  });

  return res.status(201).json({ user });
}

export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  const input = updateUserSchema.parse(req.body);

  // On vérifie explicitement l'appartenance au même restaurant avant de
  // modifier quoi que ce soit (voir note d'isolation multi-tenant en tête
  // de fichier).
  const target = await prisma.user.findFirst({ where: { id, restaurantId: req.user!.restaurantId } });
  if (!target) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable.' });
  }

  // Sans ce garde-fou, désactiver ou rétrograder le dernier Gérant actif
  // (y compris soi-même) laisserait le restaurant sans personne
  // habilitée à gérer l'équipe, la facturation ou les données RGPD —
  // aucun mécanisme de récupération autre qu'une intervention directe
  // en base.
  const losingGerantStatus =
    target.role === 'GERANT' &&
    target.isActive &&
    ((input.role !== undefined && input.role !== 'GERANT') || input.isActive === false);

  if (losingGerantStatus) {
    const otherActiveGerantCount = await prisma.user.count({
      where: { restaurantId: req.user!.restaurantId, role: 'GERANT', isActive: true, id: { not: id } },
    });
    if (otherActiveGerantCount === 0) {
      return res.status(409).json({
        error: 'LAST_GERANT',
        message: 'Impossible : ce restaurant se retrouverait sans aucun Gérant actif.',
      });
    }
  }

  const updated = await prisma.user.update({ where: { id }, data: input, select: userPublicFields });
  return res.json({ user: updated });
}
