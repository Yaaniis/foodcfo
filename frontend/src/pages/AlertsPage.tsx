import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import Badge, { type BadgeTone } from '../components/Badge';

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

// RESOLVED = succès (le problème est traité) ; DISMISSED = neutre (classée
// sans action corrective, comme une commande annulée dans le même esprit
// que le mapping déjà validé ailleurs dans le système).
const STATUS_TONE: Record<Exclude<AlertStatus, 'ACTIVE'>, BadgeTone> = {
  RESOLVED: 'success',
  DISMISSED: 'neutral',
};

const primaryBtnClass =
  'min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text text-sm font-medium hover:brightness-105 disabled:opacity-50';
const secondaryBtnClass =
  'min-h-[44px] px-4 rounded-card-md border border-border text-text-muted text-sm font-medium hover:border-border-strong disabled:opacity-50';

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
    <div className="max-w-3xl">
      <Link to="/menu" className="text-sm text-text-muted hover:text-accent">
        ← Retour à la carte
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-6">Alertes de marge</h2>

      {isLoading && <p className="text-text-faint">Chargement…</p>}
      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-4">{error}</p>
      )}

      {!isLoading && activeAlerts.length === 0 && (
        <div className="bg-good-soft border border-good/30 rounded-card-lg p-6 mb-6">
          <p className="text-good">Aucune alerte active — tout va bien.</p>
        </div>
      )}

      {activeAlerts.length > 0 && (
        <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6">
          <h3 className="font-display text-lg font-bold mb-4">Actives ({activeAlerts.length})</h3>
          <ul className="space-y-3">
            {activeAlerts.map((alert) => (
              <li key={alert.id} className="p-4 rounded-card-md bg-danger-soft border border-danger/30">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge tone="danger">{TYPE_LABELS[alert.type]}</Badge>
                  <span className="text-xs text-text-faint">{formatDate(alert.createdAt)}</span>
                </div>
                <p className="text-sm text-text mb-3">{alert.message}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pendingId === alert.id}
                    onClick={() => handleUpdateStatus(alert.id, 'RESOLVED')}
                    className={primaryBtnClass}
                  >
                    Résoudre
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === alert.id}
                    onClick={() => handleUpdateStatus(alert.id, 'DISMISSED')}
                    className={secondaryBtnClass}
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
        <div className="bg-surface border border-border rounded-card-lg shadow-card p-6">
          <h3 className="font-display text-lg font-bold mb-4">Historique</h3>
          <ul className="space-y-2">
            {pastAlerts.map((alert) => (
              <li key={alert.id} className="py-2 border-b border-border last:border-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-text-faint">{TYPE_LABELS[alert.type]}</span>
                  <Badge tone={STATUS_TONE[alert.status as Exclude<AlertStatus, 'ACTIVE'>]}>
                    {STATUS_LABELS[alert.status]}
                  </Badge>
                </div>
                <p className="text-sm text-text-muted">{alert.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
