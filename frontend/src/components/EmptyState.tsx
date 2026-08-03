import type { ReactNode } from 'react';

// Même traitement que le point 8.1.5 de l'artefact de comparaison :
// icône abstraite (cercle pointillé + un plus, pas de pictogramme de
// restauration littéral), titre, description, action. Un seul
// composant partagé plutôt qu'un "aucune donnée" réinventé par page.
export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-1.5 py-12 px-6">
      <div className="w-14 h-14 rounded-full border-[1.5px] border-dashed border-border-strong flex items-center justify-center text-text-faint mb-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {description && <p className="text-sm text-text-muted max-w-[38ch] mb-2">{description}</p>}
      {action}
    </div>
  );
}
