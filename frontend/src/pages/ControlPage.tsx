import { Link } from 'react-router-dom';

type Organism = 'URSSAF' | 'DDPP' | 'DGCCRF' | 'DGFIP' | 'INSPECTION_TRAVAIL';

// Pas de vrais logos officiels : les récupérer/héberger sans
// vérification poserait un risque (droits, laisser penser à tort à un
// partenariat avec ces organismes — point de vigilance acté en 7.0).
// Badges typographiques neutres à la place, avec le nom complet en clair.
const ORGANISMS: { key: Organism; short: string; full: string; description: string }[] = [
  { key: 'URSSAF', short: 'URSSAF', full: 'URSSAF', description: 'Cotisations sociales, travail dissimulé' },
  { key: 'DDPP', short: 'DDPP', full: 'DDPP / Services vétérinaires', description: 'Sécurité alimentaire, hygiène (HACCP)' },
  { key: 'DGCCRF', short: 'DGCCRF', full: 'DGCCRF', description: 'Affichage des prix, étiquetage, allergènes, fraude' },
  { key: 'DGFIP', short: 'DGFiP', full: 'DGFiP / Services fiscaux', description: 'TVA, conformité de la caisse (NF525)' },
  { key: 'INSPECTION_TRAVAIL', short: 'IT', full: 'Inspection du travail', description: 'Droit du travail, durée du travail, contrats' },
];

export default function ControlPage() {
  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-2xl font-bold tracking-tight mb-2">Contrôle</h2>
      <p className="text-sm text-text-muted mb-6">
        En cas de contrôle, dépose les justificatifs demandés par l'organisme concerné. FoodCFO complète
        automatiquement le dossier avec les données déjà en place (heures de travail pour l'URSSAF/l'Inspection
        du travail, historique des checklists de nettoyage pour la DDPP).
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ORGANISMS.map((o) => (
          <Link
            key={o.key}
            to={`/control/${o.key}`}
            className="bg-surface border border-border rounded-card-lg shadow-card p-5 hover:border-border-strong transition-colors flex items-start gap-3"
          >
            <span className="shrink-0 w-12 h-12 rounded-card-md bg-text text-bg flex items-center justify-center text-xs font-bold">
              {o.short}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{o.full}</p>
              <p className="text-sm text-text-muted">{o.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
