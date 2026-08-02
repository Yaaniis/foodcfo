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
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-2">Contrôle</h1>
        <p className="text-sm text-slate-500 mb-6">
          En cas de contrôle, dépose les justificatifs demandés par l'organisme concerné. FoodCFO complète
          automatiquement le dossier avec les données déjà en place (heures de travail pour l'URSSAF/l'Inspection
          du travail, historique des checklists de nettoyage pour la DDPP).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ORGANISMS.map((o) => (
            <Link
              key={o.key}
              to={`/control/${o.key}`}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 flex items-start gap-3"
            >
              <span className="shrink-0 w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                {o.short}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{o.full}</p>
                <p className="text-sm text-slate-500">{o.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
