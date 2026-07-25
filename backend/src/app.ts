// Construction de l'application Express, séparée du démarrage du
// serveur (voir index.ts). Séparation faite en Phase 1.6 pour permettre
// aux tests d'intégration d'importer `app` et de lui envoyer de vraies
// requêtes HTTP (via supertest) sans avoir à ouvrir un port réseau.
//
// IMPORTANT : ce chargement doit rester le tout premier import du
// fichier, avant tout module (comme ./config/env) qui lit process.env
// à son propre chargement. Sans ça, DATABASE_URL et les secrets JWT
// restent invisibles pour notre code.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { authRouter } from './routes/auth.routes';
import { restaurantRouter } from './routes/restaurant.routes';
import { userRouter } from './routes/user.routes';
import { supplierRouter } from './routes/supplier.routes';
import { productRouter } from './routes/product.routes';
import { menuItemRouter } from './routes/menuItem.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { invoiceRouter } from './routes/invoice.routes';
import { orderRouter } from './routes/order.routes';
import { wasteRouter } from './routes/waste.routes';
import { exportRouter } from './routes/export.routes';
import { reportRouter } from './routes/report.routes';
import { billingRouter } from './routes/billing.routes';
import { handleStripeWebhook } from './controllers/billing.controller';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { asyncHandler } from './utils/asyncHandler';

export const app = express();

// Railway (comme tout hébergeur avec load balancer/edge proxy) place le
// serveur derrière un proxy inverse : sans ce réglage, `req.ip` renverrait
// systématiquement l'IP du proxy, pas celle du client — cassant à la fois
// le rate limiting (tous les utilisateurs partageraient la même limite)
// et tout log/blocage basé sur l'IP. `1` = fait confiance au premier
// saut devant Express (le edge proxy Railway), pas à la chaîne entière.
app.set('trust proxy', 1);

app.use(helmet());

// N'autorise que le frontend connu (+ localhost en dev) plutôt que
// toute origine (`cors()` sans options renvoie `*`) — l'API sert des
// données financières/opérationnelles de restaurants, autant limiter
// dès maintenant quel site peut l'interroger depuis un navigateur.
const allowedOrigins = [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(
  (origin): origin is string => Boolean(origin),
);
app.use(
  cors({
    origin: allowedOrigins,
  }),
);

// Doit être monté AVANT express.json() : Stripe exige le corps brut
// (octets exacts reçus) pour vérifier la signature du webhook — un corps
// déjà parsé en JSON puis resérialisé ne correspondrait plus à la
// signature calculée par Stripe, même si le contenu est identique.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), asyncHandler(handleStripeWebhook));

app.use(express.json());

// Health check enrichi : vérifie aussi que la base de données répond,
// pas seulement que le serveur Node est en vie (utile pour un futur
// monitoring en production — exigence "observabilité" du prompt d'origine).
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'foodcfo-backend', database: 'connected' });
  } catch (err) {
    logger.error({ err }, 'Health check : base de données injoignable');
    res.status(503).json({ status: 'error', service: 'foodcfo-backend', database: 'unreachable' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/restaurants', restaurantRouter);
app.use('/api/users', userRouter);
app.use('/api/suppliers', supplierRouter);
app.use('/api/products', productRouter);
app.use('/api/menu-items', menuItemRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/orders', orderRouter);
app.use('/api/waste', wasteRouter);
app.use('/api/exports', exportRouter);
app.use('/api/reports', reportRouter);
app.use('/api/billing', billingRouter);

// Renvoie le profil complet de l'utilisateur connecté — interroge la
// base plutôt que de se contenter du contenu du token, pour que le
// frontend puisse restaurer une session complète (email, prénom, nom)
// après un rechargement de page, pas seulement id/rôle/restaurant.
app.get(
  '/api/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        restaurantId: true,
      },
    });
    if (!user) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable.' });
    }
    res.json({ user });
  }),
);

// Toujours en dernier : capture toutes les erreurs des middlewares/routes
// au-dessus (grâce à asyncHandler pour les routes async).
app.use(errorHandler);
