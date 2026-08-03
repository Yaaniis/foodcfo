import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import { MARGIN_STATUS_STYLES, MARGIN_STATUS_LABELS, type MarginPreview } from '../lib/margin';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import RestaurantSwitcher from '../components/RestaurantSwitcher';

const ROLE_LABELS = {
  GERANT: 'Gérant',
  CUISINE: 'Cuisine',
  SERVICE: 'Service',
} as const;

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
  const { user, logout, authFetch } = useAuth();
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
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">FoodCFO</h1>
            {user && (
              <p className="text-slate-500">
                Bonjour {user.firstName} — {ROLE_LABELS[user.role]}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              to="/account"
              className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 font-medium flex items-center"
            >
              Mon compte
            </Link>
            <button
              onClick={() => logout()}
              className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 font-medium"
            >
              Déconnexion
            </button>
          </div>
        </div>

        <RestaurantSwitcher />

        {!isOnline && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Mode hors-ligne — dernières données connues, pas nécessairement à jour.
          </p>
        )}

        {isLoading && <p className="text-slate-500">Chargement…</p>}
        {error && <p className="text-red-600">{error}</p>}

        {data && !data.kpis && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
            <p className="text-slate-600">
              Consultez la carte du restaurant et les allergènes des plats ci-dessous.
            </p>
          </div>
        )}

        {data && data.kpis && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Santé des marges</h2>
                {user?.role === 'GERANT' && (
                  <button
                    onClick={() => setShowThresholds((v) => !v)}
                    className="text-sm text-slate-500 underline"
                  >
                    {showThresholds ? 'Annuler' : 'Régler les seuils'}
                  </button>
                )}
              </div>

              {showThresholds && (
                <form
                  onSubmit={handleSaveThresholds}
                  className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-slate-600">
                      Seuil vert (%)
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={greenInput}
                        onChange={(e) => setGreenInput(e.target.value)}
                        className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                      />
                    </label>
                    <label className="text-sm text-slate-600">
                      Seuil orange (%)
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={orangeInput}
                        onChange={(e) => setOrangeInput(e.target.value)}
                        className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                      />
                    </label>
                  </div>
                  {thresholdsError && <p className="text-sm text-red-600">{thresholdsError}</p>}
                  <button
                    type="submit"
                    disabled={isSavingThresholds}
                    className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
                  >
                    {isSavingThresholds ? 'Enregistrement…' : 'Enregistrer les seuils'}
                  </button>
                </form>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-lg bg-slate-50">
                  <p className="text-xs text-slate-500">Marge moyenne</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {data.kpis.averageMarginRatio !== null ? `${data.kpis.averageMarginRatio.toFixed(1)} %` : '—'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50">
                  <p className="text-xs text-slate-500">Économies potentielles</p>
                  <p className="text-2xl font-bold text-slate-900">{formatEuros(data.kpis.potentialSavings)} €</p>
                </div>
                <div className="p-4 rounded-lg bg-emerald-50">
                  <p className="text-xs text-emerald-700">Plats en bonne santé</p>
                  <p className="text-2xl font-bold text-emerald-700">{data.kpis.greenCount}</p>
                </div>
                <div className="p-4 rounded-lg bg-red-50">
                  <p className="text-xs text-red-700">Plats en alerte</p>
                  <p className="text-2xl font-bold text-red-700">{data.kpis.orangeCount + data.kpis.redCount}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 col-span-2">
                  <p className="text-xs text-slate-500">Gaspillage ce mois-ci</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatEuros(data.kpis.wasteThisMonth)} €{' '}
                    <Link to="/waste" className="text-sm font-medium underline">
                      Détail →
                    </Link>
                  </p>
                </div>
              </div>

              {data.kpis.missingRecipeCount > 0 && (
                <p className="text-sm text-slate-500 mt-4">
                  {data.kpis.missingRecipeCount} plat(s) actif(s) sans fiche technique — marge non calculable.{' '}
                  <Link to="/menu" className="underline font-medium">
                    Compléter la carte →
                  </Link>
                </p>
              )}
            </div>

            {data.menuItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Plats</h2>
                <ul className="space-y-2">
                  {data.menuItems.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{item.name}</p>
                        <p className="text-sm text-slate-500">
                          {item.category} · {Number(item.sellingPriceTTC).toFixed(2)} € TTC
                          {item.margin && ` · marge ${item.margin.marginRatio.toFixed(1)} %`}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                          item.margin
                            ? MARGIN_STATUS_STYLES[item.margin.status]
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}
                      >
                        {item.margin ? MARGIN_STATUS_LABELS[item.margin.status] : 'Fiche manquante'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          {/* Service consulte la carte en lecture seule (décision 0.5). */}
          <Link to="/menu" className="inline-block mr-6 text-slate-900 font-medium underline">
            La carte →
          </Link>
          {/* Hygiène : lecture et checklists ouvertes à toute l'équipe
              (décision 7.0). Planning : consultation ouverte à toute
              l'équipe depuis le 03/08/2026, modification réservée au
              Gérant (masquée côté page, appliquée côté backend). */}
          <Link to="/hygiene" className="inline-block mr-6 text-slate-900 font-medium underline">
            Hygiène →
          </Link>
          <Link to="/planning" className="inline-block mr-6 text-slate-900 font-medium underline">
            Planning →
          </Link>
          {(user?.role === 'GERANT' || user?.role === 'CUISINE') && (
            <Link to="/invoices" className="inline-block mr-6 text-slate-900 font-medium underline">
              Factures →
            </Link>
          )}
          {(user?.role === 'GERANT' || user?.role === 'CUISINE') && (
            <Link to="/orders" className="inline-block mr-6 text-slate-900 font-medium underline">
              Commandes →
            </Link>
          )}
          {(user?.role === 'GERANT' || user?.role === 'CUISINE') && (
            <Link to="/waste" className="inline-block mr-6 text-slate-900 font-medium underline">
              Gaspillage →
            </Link>
          )}
          {(user?.role === 'GERANT' || user?.role === 'CUISINE') && (
            <Link to="/alerts" className="inline-block mr-6 text-slate-900 font-medium underline">
              Alertes
              {activeAlertCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold no-underline">
                  {activeAlertCount}
                </span>
              )}
              {' →'}
            </Link>
          )}
          {user?.role === 'GERANT' && (
            <Link to="/team" className="inline-block mr-6 text-slate-900 font-medium underline">
              Gérer l'équipe →
            </Link>
          )}
          {user?.role === 'GERANT' && (
            <Link to="/control" className="inline-block mr-6 text-slate-900 font-medium underline">
              Contrôle →
            </Link>
          )}
          {user?.role === 'GERANT' && (
            <Link to="/reports" className="inline-block mr-6 text-slate-900 font-medium underline">
              Rapports et exports →
            </Link>
          )}
          {user?.role === 'GERANT' && (
            <Link to="/restaurant-settings" className="inline-block mr-6 text-slate-900 font-medium underline">
              Paramètres du restaurant →
            </Link>
          )}
          {user?.role === 'GERANT' && (
            <Link to="/billing" className="inline-block text-slate-900 font-medium underline">
              Abonnement →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
