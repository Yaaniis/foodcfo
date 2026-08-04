import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import { MARGIN_STATUS_LABELS, type MarginPreview, type MarginStatus } from '../lib/margin';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import Badge, { type BadgeTone } from '../components/Badge';

const ROLE_LABELS = {
  GERANT: 'Gérant',
  CUISINE: 'Cuisine',
  SERVICE: 'Service',
} as const;

const MARGIN_STATUS_TONE: Record<MarginStatus, BadgeTone> = {
  GREEN: 'success',
  ORANGE: 'attention',
  RED: 'danger',
};

interface DashboardMenuItem {
  id: string;
  name: string;
  category: string;
  sellingPriceTTC: string;
  margin: MarginPreview | null;
}

interface DashboardData {
  thresholds: { greenThreshold: number; orangeThreshold: number };
  // null pour un compte Service : la marge et ses agrégats sont des
  // données de pilotage financier interne (décision 0.5), pas juste
  // masquées côté affichage — le backend ne les calcule/renvoie pas.
  kpis: {
    totalActiveMenuItems: number;
    missingRecipeCount: number;
    greenCount: number;
    orangeCount: number;
    redCount: number;
    averageMarginRatio: number | null;
    potentialSavings: number;
    wasteThisMonth: number;
  } | null;
  menuItems: DashboardMenuItem[];
}

function formatEuros(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const { user, authFetch } = useAuth();
  const isOnline = useOnlineStatus();

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAlertCount, setActiveAlertCount] = useState(0);

  const [showThresholds, setShowThresholds] = useState(false);
  const [greenInput, setGreenInput] = useState('');
  const [orangeInput, setOrangeInput] = useState('');
  const [thresholdsError, setThresholdsError] = useState<string | null>(null);
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const dashboard = await authFetch<DashboardData>('/api/dashboard');
      setData(dashboard);
      setGreenInput(String(dashboard.thresholds.greenThreshold));
      setOrangeInput(String(dashboard.thresholds.orangeThreshold));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger le tableau de bord.');
    } finally {
      setIsLoading(false);
    }

    // Service n'a pas accès à /api/alerts (décision 0.5, données de
    // pilotage financier) — appel évité pour ne pas générer un 403
    // systématique dans la console pour ce rôle.
    if (user?.role === 'GERANT' || user?.role === 'CUISINE') {
      try {
        const { alerts } = await authFetch<{ alerts: { status: string }[] }>('/api/alerts');
        setActiveAlertCount(alerts.filter((a) => a.status === 'ACTIVE').length);
      } catch {
        // Non bloquant : l'essentiel du tableau de bord reste utilisable
        // même si le décompte d'alertes échoue à charger.
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveThresholds(e: FormEvent) {
    e.preventDefault();
    setThresholdsError(null);
    setIsSavingThresholds(true);
    try {
      await authFetch('/api/restaurants/me/thresholds', {
        method: 'PATCH',
        body: JSON.stringify({
          marginGreenThreshold: Number(greenInput),
          marginOrangeThreshold: Number(orangeInput),
        }),
      });
      setShowThresholds(false);
      await load();
    } catch (err) {
      setThresholdsError(
        err instanceof ApiRequestError ? err.message : "Impossible d'enregistrer les seuils.",
      );
    } finally {
      setIsSavingThresholds(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-2xl font-bold tracking-tight">Tableau de bord</h2>
      {user && (
        <p className="text-text-muted mt-1">
          Bonjour {user.firstName} — {ROLE_LABELS[user.role]}
        </p>
      )}

      {!isOnline && (
        <p className="text-sm text-warn bg-warn-soft border border-warn/30 rounded-card-md px-3 py-2 mt-4">
          Mode hors-ligne — dernières données connues, pas nécessairement à jour.
        </p>
      )}

      {isLoading && <p className="text-text-faint mt-4">Chargement…</p>}
      {error && <p className="text-danger mt-4">{error}</p>}

      {data && !data.kpis && (
        <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mt-4">
          <p className="text-text-muted">
            Consultez la carte du restaurant et les allergènes des plats ci-dessous.
          </p>
        </div>
      )}

      {data && data.kpis && (
        <>
          <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold">Santé des marges</h3>
              {user?.role === 'GERANT' && (
                <button
                  onClick={() => setShowThresholds((v) => !v)}
                  className="text-sm text-text-muted hover:text-accent"
                >
                  {showThresholds ? 'Annuler' : 'Régler les seuils'}
                </button>
              )}
            </div>

            {showThresholds && (
              <form
                onSubmit={handleSaveThresholds}
                className="mb-6 p-4 rounded-card-md bg-surface-hover border border-border space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm text-text-muted">
                    Seuil vert (%)
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={greenInput}
                      onChange={(e) => setGreenInput(e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </label>
                  <label className="text-sm text-text-muted">
                    Seuil orange (%)
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={orangeInput}
                      onChange={(e) => setOrangeInput(e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </label>
                </div>
                {thresholdsError && <p className="text-sm text-danger">{thresholdsError}</p>}
                <button
                  type="submit"
                  disabled={isSavingThresholds}
                  className="min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium disabled:opacity-50"
                >
                  {isSavingThresholds ? 'Enregistrement…' : 'Enregistrer les seuils'}
                </button>
              </form>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-card-md bg-surface-hover">
                <p className="text-xs text-text-faint uppercase tracking-wide">Marge moyenne</p>
                <p className="text-2xl font-bold font-display mt-0.5">
                  {data.kpis.averageMarginRatio !== null ? `${data.kpis.averageMarginRatio.toFixed(1)} %` : '—'}
                </p>
              </div>
              <div className="p-4 rounded-card-md bg-surface-hover">
                <p className="text-xs text-text-faint uppercase tracking-wide">Économies potentielles</p>
                <p className="text-2xl font-bold font-display mt-0.5">{formatEuros(data.kpis.potentialSavings)} €</p>
              </div>
              <div className="p-4 rounded-card-md bg-good-soft">
                <p className="text-xs text-good uppercase tracking-wide">Plats en bonne santé</p>
                <p className="text-2xl font-bold font-display text-good mt-0.5">{data.kpis.greenCount}</p>
              </div>
              <div className="p-4 rounded-card-md bg-warn-soft">
                <p className="text-xs text-warn uppercase tracking-wide">Plats en alerte</p>
                <p className="text-2xl font-bold font-display text-warn mt-0.5">
                  {data.kpis.orangeCount + data.kpis.redCount}
                </p>
              </div>
              <div className="p-4 rounded-card-md bg-surface-hover col-span-2">
                <p className="text-xs text-text-faint uppercase tracking-wide">Gaspillage ce mois-ci</p>
                <p className="text-2xl font-bold font-display mt-0.5">
                  {formatEuros(data.kpis.wasteThisMonth)} €{' '}
                  <Link to="/waste" className="text-sm font-medium text-accent hover:underline">
                    Détail →
                  </Link>
                </p>
              </div>
            </div>

            {data.kpis.missingRecipeCount > 0 && (
              <p className="text-sm text-text-muted mt-4">
                {data.kpis.missingRecipeCount} plat(s) actif(s) sans fiche technique — marge non calculable.{' '}
                <Link to="/menu" className="text-accent font-medium hover:underline">
                  Compléter la carte →
                </Link>
              </p>
            )}
          </div>

          {data.menuItems.length > 0 && (
            <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mt-4">
              <h3 className="font-display text-lg font-semibold mb-4">Plats</h3>
              <ul>
                {data.menuItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-3 border-t border-border first:border-t-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-sm text-text-faint">
                        {item.category} · {Number(item.sellingPriceTTC).toFixed(2)} € TTC
                        {item.margin && ` · marge ${item.margin.marginRatio.toFixed(1)} %`}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {item.margin ? (
                        <Badge tone={MARGIN_STATUS_TONE[item.margin.status]}>
                          {MARGIN_STATUS_LABELS[item.margin.status]}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Fiche manquante</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Raccourcis vers les routes réelles sans rubrique propre dans la
          barre latérale ou le menu du compte (rattachées conceptuellement
          à Carte & Marges / Fournisseurs / Tableau de bord, voir
          FoodCFO_PLAN.md Phase 8.2) — tant que SuppliersProductsPage et
          les autres pages concernées n'ont pas encore leur propre lien
          contextuel, elles restent accessibles depuis ici. Le gaspillage
          a déjà son propre lien "Détail →" sur la tuile KPI ci-dessus. */}
      {(user?.role === 'GERANT' || user?.role === 'CUISINE') && (
        <div className="flex flex-wrap gap-2 mt-4">
          <Link
            to="/orders"
            className="min-h-[40px] px-4 inline-flex items-center rounded-card-md border border-border bg-surface text-sm font-medium hover:border-border-strong hover:text-accent"
          >
            Commandes →
          </Link>
          <Link
            to="/pos/sales"
            className="min-h-[40px] px-4 inline-flex items-center rounded-card-md border border-border bg-surface text-sm font-medium hover:border-border-strong hover:text-accent"
          >
            Ventes à rapprocher →
          </Link>
          <Link
            to="/alerts"
            className="min-h-[40px] px-4 inline-flex items-center gap-2 rounded-card-md border border-border bg-surface text-sm font-medium hover:border-border-strong hover:text-accent"
          >
            Alertes
            {activeAlertCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-danger text-white text-xs font-bold">
                {activeAlertCount}
              </span>
            )}
          </Link>
          {user?.role === 'GERANT' && (
            <Link
              to="/reports"
              className="min-h-[40px] px-4 inline-flex items-center rounded-card-md border border-border bg-surface text-sm font-medium hover:border-border-strong hover:text-accent"
            >
              Rapports et exports →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
