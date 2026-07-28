import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

type AlertStatus = 'ACTIVE' | 'RESOLVED' | 'DISMISSED';
type AlertType = 'MARGIN_BELOW_THRESHOLD' | 'SUPPLIER_PRICE_INCREASE';

interface MarginAlert {
  id: string;
  type: AlertType;
  status: AlertStatus;
  thresholdValue: string;
  currentValue: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  menuItem: { id: string; name: string } | null;
}

const TYPE_LABELS: Record<AlertType, string> = {
  MARGIN_BELOW_THRESHOLD: 'Marge sous le seuil',
  SUPPLIER_PRICE_INCREASE: 'Hausse de prix fournisseur',
};

const STATUS_LABELS: Record<AlertStatus, string> = {
  ACTIVE: 'Active',
  RESOLVED: 'Résolue',
  DISMISSED: 'Ignorée',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function AlertsPage() {
  const { authFetch } = useAuth();

  const [alerts, setAlerts] = useState<MarginAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch<{ alerts: MarginAlert[] }>('/api/alerts');
      setAlerts(res.alerts);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger les alertes.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpdateStatus(id: string, status: 'RESOLVED' | 'DISMISSED') {
    setPendingId(id);
    setError(null);
    try {
      await authFetch(`/api/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible de mettre à jour cette alerte.");
    } finally {
      setPendingId(null);
    }
  }

  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
  const pastAlerts = alerts.filter((a) => a.status !== 'ACTIVE');

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Alertes de marge</h1>

        {isLoading && <p className="text-slate-500">Chargement…</p>}
        {error && <p className="text-red-600 mb-4">{error}</p>}

        {!isLoading && activeAlerts.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <p className="text-slate-600">Aucune alerte active — tout va bien.</p>
          </div>
        )}

        {activeAlerts.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Actives ({activeAlerts.length})</h2>
            <ul className="space-y-3">
              {activeAlerts.map((alert) => (
                <li key={alert.id} className="p-4 rounded-lg bg-red-50 border border-red-200">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-1 rounded bg-red-100 text-red-700">
                      {TYPE_LABELS[alert.type]}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(alert.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-800 mb-3">{alert.message}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pendingId === alert.id}
                      onClick={() => handleUpdateStatus(alert.id, 'RESOLVED')}
                      className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
                    >
                      Résoudre
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === alert.id}
                      onClick={() => handleUpdateStatus(alert.id, 'DISMISSED')}
                      className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium disabled:opacity-50"
                    >
                      Ignorer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pastAlerts.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Historique</h2>
            <ul className="space-y-2">
              {pastAlerts.map((alert) => (
                <li key={alert.id} className="py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-slate-500">{TYPE_LABELS[alert.type]}</span>
                    <span className="text-xs font-medium text-slate-500">{STATUS_LABELS[alert.status]}</span>
                  </div>
                  <p className="text-sm text-slate-600">{alert.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
