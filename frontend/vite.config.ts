import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Mode hors-ligne partiel (exigence transversale du plan) : consultation
// des marges + saisie de gaspillage possibles sans réseau.
//
// - Le tableau de bord (/api/dashboard) et les listes nécessaires à la
//   saisie de gaspillage (/api/products, /api/menu-items) sont mis en
//   cache en NetworkFirst : la donnée la plus fraîche est utilisée dès
//   qu'elle est disponible, sinon la dernière version connue s'affiche.
// - Les écritures (déclarer une perte) ne peuvent pas être mises en
//   cache HTTP — c'est le rôle de la file de synchronisation côté
//   client (frontend/src/lib/offlineQueue.ts), pas de Workbox.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        // Service worker actif aussi en `vite dev`, pour pouvoir tester
        // le hors-ligne sans avoir à faire un build de production.
        enabled: true,
      },
      manifest: {
        name: 'FoodCFO',
        short_name: 'FoodCFO',
        description: 'Suivi des marges et des coûts pour restaurateurs',
        theme_color: '#0f172a',
        display: 'standalone',
        icons: [],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              ['/api/dashboard', '/api/products', '/api/menu-items'].some((path) => url.pathname.startsWith(path)),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'foodcfo-api-cache',
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
