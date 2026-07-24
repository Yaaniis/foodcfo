/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Zones cliquables larges et contrastes élevés (exigence
      // "tactile-first" du prompt d'origine) — palette et espacements
      // à affiner en Phase 1.4 lors des premiers écrans réels.
    },
  },
  plugins: [],
};
