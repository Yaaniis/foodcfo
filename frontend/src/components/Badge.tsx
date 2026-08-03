import type { ReactNode } from 'react';

// Cinq tons sémantiques repris tels quels de l'artefact de comparaison
// (Phase 8.1, point "badges/statuts cohérent") : neutre (pas encore
// actif), info (en cours, rien à faire), attention (nécessite une
// action), succès (terminé), danger (a échoué). Un seul composant
// partagé plutôt qu'un style de pastille réinventé par écran.
export type BadgeTone = 'neutral' | 'info' | 'attention' | 'success' | 'danger';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-hover text-text-muted',
  info: 'bg-info-soft text-info',
  attention: 'bg-warn-soft text-warn',
  success: 'bg-good-soft text-good',
  danger: 'bg-danger-soft text-danger',
};

export default function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={
        // Pas de whitespace-nowrap : certains libellés réels (ex. statut
        // de facture "Extraction échouée — saisie manuelle") sont plus
        // longs que ce qu'on avait dans l'artefact — le badge doit
        // pouvoir passer sur 2 lignes plutôt que déborder de sa colonne.
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:shrink-0 " +
        TONE_CLASSES[tone]
      }
    >
      {children}
    </span>
  );
}
