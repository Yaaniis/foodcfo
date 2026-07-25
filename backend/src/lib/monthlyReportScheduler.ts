// Planifie l'envoi automatique du rapport mensuel — le 1er de chaque
// mois à 6h (heure serveur), pour tous les restaurants ayant au moins
// un compte Gérant actif. Enregistré depuis index.ts uniquement (jamais
// depuis app.ts), pour que les tests d'intégration qui importent `app`
// ne déclenchent jamais de vrais envois d'email.
//
// Compatible avec la cible de déploiement retenue (décision 0.4,
// Railway) : un process Node persistant peut porter un scheduler
// in-process comme celui-ci, contrairement à une cible serverless.

import cron from 'node-cron';
import { prisma } from './prisma';
import { logger } from './logger';
import { sendMonthlyReportForRestaurant } from '../controllers/report.controller';

export function scheduleMonthlyReports(): void {
  // "0 6 1 * *" = à 6h00, le 1er jour de chaque mois.
  cron.schedule('0 6 1 * *', async () => {
    logger.info('Envoi automatique des rapports mensuels — démarrage');

    // Date de référence dans le mois qui vient de se terminer (le
    // dernier jour du mois précédent), pour que gatherMonthlyReportData
    // rapporte le mois écoulé plutôt que le mois qui commence.
    const referenceDate = new Date();
    referenceDate.setDate(0);

    const restaurants = await prisma.restaurant.findMany({
      where: { users: { some: { role: 'GERANT', isActive: true } } },
      select: { id: true },
    });

    for (const restaurant of restaurants) {
      try {
        const result = await sendMonthlyReportForRestaurant(restaurant.id, referenceDate);
        logger.info(
          { restaurantId: restaurant.id, sentTo: result.sentTo, failedCount: result.failedCount },
          'Rapport mensuel traité',
        );
      } catch (err) {
        logger.error({ err, restaurantId: restaurant.id }, "Échec de l'envoi du rapport mensuel");
      }
    }
  });

  logger.info('Planification du rapport mensuel automatique activée (1er du mois, 6h)');
}
