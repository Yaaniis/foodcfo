import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import { POS_PROVIDERS, posProviderLabel } from '../lib/posProviders';

interface PosConnection {
  id: string;
  provider: string;
  isActive: boolean;
  connectedAt: string;
  disconnectedAt: string | null;
}

const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass = 'min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium disabled:opacity-50 hover:brightness-105';
const secondaryBtnClass = 'min-h-[44px] px-4 rounded-card-md border border-border text-sm font-medium hover:border-border-strong';

export default function PosPage() {
  const { authFetch } = useAuth();

  const [connections, setConnections] = useState<PosConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selected, setSelected] = useState('');

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await authFetch<{ connections: PosConnection[] }>('/api/pos/connections');
      setConnections(data.connections);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger les connexions caisse.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeConnection = connections.find((c) => c.isActive) ?? null;

  async function handleConnect() {
    if (!selected) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await authFetch('/api/pos/connections', { method: 'POST', body: JSON.stringify({ provider: selected }) });
      setSelected('');
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de connecter ce système de caisse.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDisconnect() {
    if (!activeConnection) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await authFetch(`/api/pos/connections/${activeConnection.id}/disconnect`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de déconnecter ce système de caisse.');
    } finally {
      setIsSubmitting(false);
    }
  }

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

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-4">{error}</p>
      )}

      {isLoading ? (
        <p className="text-text-faint">Chargement…</p>
      ) : activeConnection ? (
        <div className="bg-surface border border-border rounded-card-lg shadow-card p-6">
          <p className="text-sm text-text-muted mb-1">Système connecté</p>
          <p className="font-display text-lg font-bold mb-4">{posProviderLabel(activeConnection.provider)}</p>

          <p className="text-sm text-warn bg-warn-soft border border-warn/30 rounded-card-md px-3 py-2 mb-4">
            Votre choix est enregistré, mais la remontée automatique des ventes n'est pas encore active — c'est la
            prochaine étape.
          </p>

          <div className="flex flex-wrap gap-2">
            <Link to="/pos/sales" className={secondaryBtnClass}>
              Voir les ventes à rapprocher
            </Link>
            <button onClick={handleDisconnect} disabled={isSubmitting} className={secondaryBtnClass}>
              {isSubmitting ? 'Déconnexion…' : 'Déconnecter'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-card-lg shadow-card p-6">
          <label htmlFor="pos-system" className="block text-sm font-medium text-text-muted mb-1.5">
            Quel système de caisse utilisez-vous ?
          </label>
          <select id="pos-system" value={selected} onChange={(e) => setSelected(e.target.value)} className={inputClass}>
            <option value="">Choisir votre système de caisse…</option>
            {POS_PROVIDERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {selected && (
            <>
              <p className="text-sm text-text-muted mt-4 mb-3">
                La configuration technique de la connexion à <strong className="text-text">{posProviderLabel(selected)}</strong> n'est
                pas encore disponible — c'est la prochaine étape. Vous pouvez tout de même enregistrer votre choix dès
                maintenant.
              </p>
              <button onClick={handleConnect} disabled={isSubmitting} className={primaryBtnClass}>
                {isSubmitting ? 'Connexion…' : 'Connecter'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
