// Logs structurés (JSON en production, lisible en couleur en
// développement). Objectif du prompt d'origine : "logs structurés" pour
// pouvoir diagnostiquer un problème en production sans deviner.

import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        }
      : undefined,
});
