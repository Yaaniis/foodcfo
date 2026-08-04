import { useState } from 'react';
import { Link } from 'react-router-dom';

// Phase 9 (04/08/2026) — liste des 5 systèmes tranchée avec l'utilisateur
// après recherche du paysage français réel (voir FoodCFO_PLAN.md) :
// convergence de plusieurs comparatifs indépendants sur ces 5 noms.
// SumUp explicitement écarté (pas de Titre Restaurant, intégration
// fermée — pas assez professionnel pour la cible de FoodCFO).
const POS_SYSTEMS = [
  { value: 'lightspeed', label: 'Lightspeed' },
  { value: 'laddition', label: "L'Addition" },
  { value: 'zelty', label: 'Zelty' },
  { value: 'innovorder', label: 'Innovorder' },
  { value: 'clyo', label: 'Clyo Systems' },
];

const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';

export default function PosPage() {
  const [selected, setSelected] = useState('');
  const selectedLabel = POS_SYSTEMS.find((s) => s.value === selected)?.label;

  return (
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-text-muted hover:text-accent">
        ← Retour à l'accueil
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-2">Caisse enregistreuse</h2>
      <p className="text-sm text-text-muted mb-6">
        Connectez la caisse de votre restaurant pour que chaque vente remonte automatiquement dans FoodCFO — plats
        vendus et marges recalculées, sans ressaisie manuelle.
      </p>

      <p className="text-sm text-warn bg-warn-soft border border-warn/30 rounded-card-md px-3 py-2 mb-6">
        Fonctionnalité en cours de construction — le choix ci-dessous prépare la connexion, mais celle-ci n'est pas
        encore active.
      </p>

      <div className="bg-surface border border-border rounded-card-lg shadow-card p-6">
        <label htmlFor="pos-system" className="block text-sm font-medium text-text-muted mb-1.5">
          Quel système de caisse utilisez-vous ?
        </label>
        <select id="pos-system" value={selected} onChange={(e) => setSelected(e.target.value)} className={inputClass}>
          <option value="">Choisir votre système de caisse…</option>
          {POS_SYSTEMS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {selected && (
          <p className="text-sm text-text-muted mt-4">
            La configuration de la connexion à <strong className="text-text">{selectedLabel}</strong> n'est pas
            encore disponible — c'est la prochaine étape.
          </p>
        )}
      </div>
    </div>
  );
}
