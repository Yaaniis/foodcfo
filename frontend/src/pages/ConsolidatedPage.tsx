import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface RestaurantSummary {
  restaurantId: string;
  restaurantName: string;
  activeAlertCount: number;
  kpis: {
    totalActiveMenuItems: number;
    missingRecipeCount: number;
    greenCount: number;
    orangeCount: number;
    redCount: number;
    averageMarginRatio: number | null;
    potentialSavings: number;
    wasteThisMonth: number;
  };
}

interface ConsolidatedData {
  totals: {
    restaurantCount: number;
    averageMarginRatio: number | null;
    totalPotentialSavings: number;
    totalWasteThisMonth: number;
    totalRedAlerts: number;
    totalActiveAlerts: number;
  };
  restaurants: RestaurantSummary[];
}

function formatEuros(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ConsolidatedPage() {
  const { authFetch } = useAuth();

  const [data, setData] = useState<ConsolidatedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<ConsolidatedData>('/api/restaurants/consolidated')
      .then(setData)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger la vue consolidée.'))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return <p className="text-text-faint">Chargement…</p>;
  }

  return (
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-text-muted hover:text-accent">
        ← Retour à l'accueil
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-6">Vue consolidée</h2>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-4">{error}</p>
      )}

      {data && (
        <>
          <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-4">
            <p className="text-sm font-medium text-text-muted mb-3">
              {data.totals.restaurantCount} restaurant(s)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-card-md bg-surface-hover">
                <p className="text-xs text-text-faint uppercase tracking-wide">Marge moyenne (tous restaurants)</p>
                <p className="text-lg font-bold font-display mt-0.5">
                  {data.totals.averageMarginRatio !== null ? `${data.totals.averageMarginRatio.toFixed(1)} %` : '—'}
                </p>
              </div>
              <div className="p-3 rounded-card-md bg-danger-soft">
                <p className="text-xs text-danger uppercase tracking-wide">Plats en alerte rouge (total)</p>
                <p className="text-lg font-bold font-display text-danger mt-0.5">{data.totals.totalRedAlerts}</p>
              </div>
              <div className="p-3 rounded-card-md bg-danger-soft">
                <p className="text-xs text-danger uppercase tracking-wide">Alertes actives (total)</p>
                <p className="text-lg font-bold font-display text-danger mt-0.5">{data.totals.totalActiveAlerts}</p>
              </div>
              <div className="p-3 rounded-card-md bg-surface-hover">
                <p className="text-xs text-text-faint uppercase tracking-wide">Économies potentielles (total)</p>
                <p className="text-lg font-bold font-display mt-0.5">{formatEuros(data.totals.totalPotentialSavings)} €</p>
              </div>
              <div className="p-3 rounded-card-md bg-surface-hover">
                <p className="text-xs text-text-faint uppercase tracking-wide">Gaspillage du mois (total)</p>
                <p className="text-lg font-bold font-display mt-0.5">{formatEuros(data.totals.totalWasteThisMonth)} €</p>
              </div>
            </div>
          </div>

          <ul className="space-y-2">
            {data.restaurants.map((r) => (
              <li key={r.restaurantId} className="bg-surface border border-border rounded-card-lg shadow-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{r.restaurantName}</p>
                  {r.activeAlertCount > 0 && (
                    <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-danger text-text text-xs font-bold">
                      {r.activeAlertCount}
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-muted">
                  Marge moyenne :{' '}
                  {r.kpis.averageMarginRatio !== null ? `${r.kpis.averageMarginRatio.toFixed(1)} %` : '—'}
                  {' · '}
                  {r.kpis.greenCount} en bonne santé, {r.kpis.orangeCount + r.kpis.redCount} en alerte
                  {' · '}
                  Gaspillage {formatEuros(r.kpis.wasteThisMonth)} €
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
