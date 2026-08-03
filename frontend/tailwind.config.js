/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Zones cliquables larges et contrastes élevés (exigence
      // "tactile-first" du prompt d'origine) — déjà respecté partout
      // via min-h-[44px].
      //
      // Système de design "Service du soir" (Phase 8, validé le
      // 03/08/2026 dans l'artefact de comparaison avant tout code réel
      // — voir FoodCFO_PLAN.md, Phase 8.1). Noms de tokens identiques
      // à ceux de l'artefact pour rester traçable entre les deux.
      colors: {
        bg: '#0a0e1a',
        surface: 'rgba(255,255,255,0.045)',
        'surface-solid': '#131928',
        'surface-hover': 'rgba(255,255,255,0.075)',
        border: 'rgba(232,234,242,0.09)',
        'border-strong': 'rgba(232,234,242,0.16)',
        text: '#e8eaf2',
        'text-muted': '#9aa1c0',
        'text-faint': '#656d92',
        accent: '#ff9f4a',
        'accent-soft': 'rgba(255,159,74,0.14)',
        'accent-text': '#1a1206',
        good: '#6ee7b0',
        'good-soft': 'rgba(110,231,176,0.14)',
        warn: '#ff8a7a',
        'warn-soft': 'rgba(255,138,122,0.14)',
        info: '#8fa8f5',
        'info-soft': 'rgba(143,168,245,0.14)',
        danger: '#e3395a',
        'danger-soft': 'rgba(227,57,90,0.16)',
      },
      // Noms distincts des échelles par défaut de Tailwind (rounded-sm
      // etc.) pour ne jamais changer silencieusement l'apparence des
      // écrans pas encore migrés vers la nouvelle identité.
      borderRadius: {
        'card-sm': '10px',
        'card-md': '14px',
        'card-lg': '20px',
      },
      boxShadow: {
        card: '0 20px 50px -20px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(232,234,242,0.09), 0 0 40px -12px rgba(255,159,74,0.25)',
        logo: '0 6px 20px -4px rgba(255,159,74,0.55), 0 0 0 1px rgba(255,201,140,0.25) inset',
      },
      backgroundImage: {
        'app-gradient': 'radial-gradient(ellipse 90% 60% at 30% -10%, #29305a 0%, #141a30 45%, #0a0e1a 100%)',
        'logo-fill': 'linear-gradient(145deg, #ffcb98 0%, #ff9f4a 55%, #d9601f 100%)',
        'chart-bar-1': 'linear-gradient(180deg, #ffb976 0%, #ff9f4a 100%)',
        'chart-bar-2': 'linear-gradient(180deg, #4a5488 0%, #333c66 100%)',
      },
      fontFamily: {
        display: ['"SF Pro Rounded"', 'ui-rounded', '"Segoe UI Rounded"', '-apple-system', 'system-ui', 'sans-serif'],
        logo: ['Constantia', '"Iowan Old Style"', 'Georgia', '"Times New Roman"', 'serif'],
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '180% 0' },
          '100%': { backgroundPosition: '-20% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
