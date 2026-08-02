import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

type Organism = 'URSSAF' | 'DDPP' | 'DGCCRF' | 'DGFIP' | 'INSPECTION_TRAVAIL';

const ORGANISM_LABELS: Record<Organism, string> = {
  URSSAF: 'URSSAF',
  DDPP: 'DDPP / Services vétérinaires',
  DGCCRF: 'DGCCRF',
  DGFIP: 'DGFiP / Services fiscaux',
  INSPECTION_TRAVAIL: 'Inspection du travail',
};

// Suggestions de catégories par organisme (aide à la saisie via
// <datalist>, jamais une contrainte stricte — category reste une
// String libre côté backend, les listes précises restent à affiner
// avec l'usage réel).
const CATEGORY_SUGGESTIONS: Record<Organism, string[]> = {
  URSSAF: ['Contrat de travail', 'Registre unique du personnel', 'Bulletin de paye', 'Avenant', 'Déclaration sociale (DSN)'],
  DDPP: [
    'PMS (Plan de Maîtrise Sanitaire)',
    'Relevé de température',
    'Attestation de formation HACCP',
    'Plan de nettoyage',
    'Traçabilité produits',
  ],
  DGCCRF: ['Affichage des prix', 'Étiquetage allergènes', 'Origine des viandes', 'Facture fournisseur', 'Réclamation client'],
  DGFIP: ['Attestation logiciel de caisse (NF525)', 'Facture de vente', 'Déclaration de TVA', 'Livre de recettes'],
  INSPECTION_TRAVAIL: [
    'Contrat de travail',
    'Registre unique du personnel',
    'Affichage obligatoire',
    'DUERP',
    'Règlement intérieur',
  ],
};

interface ControlDocument {
  id: string;
  organism: Organism;
  category: string;
  label: string;
  fileMimeType: string;
  uploadedAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string };
}

interface HoursSummaryRow {
  firstName: string;
  lastName: string;
  totalHours: string;
}

interface CleaningHistoryRow {
  id: string;
  templateName: string;
  serviceDate: string;
  completedAt: string | null;
}

interface Dossier {
  organism: Organism;
  periodStart: string;
  periodEnd: string;
  documents: ControlDocument[];
  hoursSummary?: HoursSummaryRow[];
  cleaningHistory?: CleaningHistoryRow[];
}

export default function ControlOrganismPage() {
  const { organism } = useParams<{ organism: Organism }>();
  const { authFetch } = useAuth();

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (periodStart) params.set('periodStart', periodStart);
      if (periodEnd) params.set('periodEnd', periodEnd);
      const data = await authFetch<Dossier>(`/api/control/dossier/${organism}?${params.toString()}`);
      setDossier(data);
      setPeriodStart(data.periodStart);
      setPeriodEnd(data.periodEnd);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger ce dossier.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organism]);

  const [category, setCategory] = useState('');
  const [label, setLabel] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError('Choisis un fichier (PDF, JPG ou PNG).');
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('organism', organism!);
      formData.append('category', category);
      formData.append('label', label);
      formData.append('file', file);
      await authFetch('/api/control/documents', { method: 'POST', body: formData });
      setCategory('');
      setLabel('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setUploadError(err instanceof ApiRequestError ? err.message : "Impossible de déposer ce document.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await authFetch(`/api/control/documents/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de supprimer ce document.');
    }
  }

  const suggestions = organism ? CATEGORY_SUGGESTIONS[organism] : [];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/control" className="text-sm text-slate-500 underline">
          ← Retour au contrôle
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">{organism ? ORGANISM_LABELS[organism] : ''}</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}
        {isLoading && <p className="text-slate-500">Chargement…</p>}

        {!isLoading && dossier && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                load();
              }}
              className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 flex items-end gap-3"
            >
              <label className="text-sm text-slate-600 flex-1">
                Du
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                />
              </label>
              <label className="text-sm text-slate-600 flex-1">
                Au
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                />
              </label>
              <button type="submit" className="min-h-[44px] px-4 rounded-lg border border-slate-300 font-medium">
                Filtrer
              </button>
            </form>

            {dossier.hoursSummary && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6">
                <p className="font-medium text-slate-900 mb-2">Récapitulatif d'heures (période sélectionnée)</p>
                {dossier.hoursSummary.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune heure enregistrée sur cette période.</p>
                ) : (
                  <ul className="text-sm text-slate-600 space-y-1">
                    {dossier.hoursSummary.map((h, i) => (
                      <li key={i}>
                        {h.firstName} {h.lastName} — {h.totalHours} h
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {dossier.cleaningHistory && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6">
                <p className="font-medium text-slate-900 mb-2">Historique des checklists de nettoyage</p>
                {dossier.cleaningHistory.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune checklist sur cette période.</p>
                ) : (
                  <ul className="text-sm text-slate-600 space-y-1">
                    {dossier.cleaningHistory.map((c) => (
                      <li key={c.id}>
                        {new Date(`${c.serviceDate}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} ·{' '}
                        {c.templateName} · {c.completedAt ? 'Complétée' : 'En cours'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <form onSubmit={handleUpload} className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-3">
              <p className="text-sm font-medium text-slate-700">Déposer un justificatif</p>
              <input
                list="category-suggestions"
                placeholder="Catégorie (ex: Contrat de travail)"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <datalist id="category-suggestions">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <input
                placeholder="Libellé (ex: Contrat de Marie Dupont)"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="w-full text-sm" />
              {uploadError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{uploadError}</p>
              )}
              <button
                type="submit"
                disabled={isUploading}
                className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
              >
                {isUploading ? 'Envoi…' : 'Déposer ce document'}
              </button>
            </form>

            <p className="font-medium text-slate-900 mb-2">Documents déposés</p>
            <ul className="space-y-2">
              {dossier.documents.map((d) => (
                <li
                  key={d.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{d.label}</p>
                    <p className="text-sm text-slate-500 truncate">
                      {d.category} · {new Date(d.uploadedAt).toLocaleDateString('fr-FR')} · {d.uploadedBy.firstName}{' '}
                      {d.uploadedBy.lastName}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="shrink-0 min-h-[44px] px-3 rounded-lg border border-slate-300 text-sm font-medium"
                  >
                    Supprimer
                  </button>
                </li>
              ))}
              {dossier.documents.length === 0 && <p className="text-slate-500">Aucun document déposé pour l'instant.</p>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
