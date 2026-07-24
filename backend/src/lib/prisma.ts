// Client Prisma partagé par toute l'application. Une seule instance,
// réutilisée partout (pas de "new PrismaClient()" dans chaque fichier),
// pour éviter d'épuiser les connexions PostgreSQL disponibles.
//
// Le stockage sur `globalThis` évite aussi de recréer une instance à
// chaque rechargement à chaud en développement (tsx watch).

import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
