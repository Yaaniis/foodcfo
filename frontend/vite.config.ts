import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// ⚠️ Configuration PWA minimale ici (Phase 1.2 = structure). Le cache
// hors-ligne des données du jour et la file de synchronisation seront
// affinés dans les "Exigences transversales" du plan (mode hors-ligne
// partiel), une fois que le frontend aura de vraies données à mettre
// en cache.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'FoodCFO',
        short_name: 'FoodCFO',
        description: 'Suivi des marges et des coûts pour restaurateurs',
        theme_color: '#0f172a',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
