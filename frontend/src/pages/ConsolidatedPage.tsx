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
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Vue consolidée</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        {data && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
              <p className="text-sm font-medium text-slate-700 mb-3">
                {data.totals.restaurantCount} restaurant(s)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-50">
                  <p className="text-xs text-slate-500">Marge moyenne (tous restaurants)</p>
                  <p className="text-lg font-bold text-slate-900">
                    {data.totals.averageMarginRatio !== null ? `${data.totals.averageMarginRatio.toFixed(1)} %` : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-red-50">
                  <p className="text-xs text-red-700">Plats en alerte rouge (total)</p>
                  <p className="text-lg font-bold text-red-700">{data.totals.totalRedAlerts}</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50">
                  <p className="text-xs text-red-700">Alertes actives (total)</p>
                  <p className="text-lg font-bold text-red-700">{data.totals.totalActiveAlerts}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50">
                  <p className="text-xs text-slate-500">Économies potentielles (total)</p>
                  <p className="text-lg font-bold text-slate-900">{formatEuros(data.totals.totalPotentialSavings)} €</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50">
                  <p className="text-xs text-slate-500">Gaspillage du mois (total)</p>
                  <p className="text-lg font-bold text-slate-900">{formatEuros(data.totals.totalWasteThisMonth)} €</p>
                </div>
              </div>
            </div>

            <ul className="space-y-2">
              {data.restaurants.map((r) => (
                <li key={r.restaurantId} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{r.restaurantName}</p>
                    {r.activeAlertCount > 0 && (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold">
                        {r.activeAlertCount}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
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
    </div>
  );
}
