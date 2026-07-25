// Point d'entrée du serveur backend FoodCFO — démarrage réel (port
// réseau). La construction de l'application elle-même vit dans app.ts,
// séparée depuis la Phase 1.6 pour que les tests d'intégration puissent
// importer `app` sans passer par ce fichier (donc sans ouvrir de port).

import { app } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { scheduleMonthlyReports } from './lib/monthlyReportScheduler';

app.listen(env.PORT, () => {
  logger.info(`🚀 FoodCFO backend démarré sur http://localhost:${env.PORT}`);
});

scheduleMonthlyReports();

// Arrêt propre : ferme la connexion Prisma si le process est interrompu
// (Ctrl+C), pour ne pas laisser de connexions ouvertes à la base.
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
