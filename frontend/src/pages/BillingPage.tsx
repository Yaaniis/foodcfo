import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface BillingStatus {
  billingConfigured: boolean;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Actif', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  TRIALING: { label: "Période d'essai", className: 'bg-blue-50 text-blue-700 border-blue-200' },
  PAST_DUE: { label: 'Paiement en retard', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  UNPAID: { label: 'Impayé', className: 'bg-red-50 text-red-700 border-red-200' },
  CANCELED: { label: 'Résilié', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  INCOMPLETE: { label: 'Incomplet', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  INCOMPLETE_EXPIRED: { label: 'Expiré sans paiement', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  PAUSED: { label: 'En pause', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function BillingPage() {
  const { authFetch } = useAuth();
  const [searchParams] = useSearchParams();
  const checkoutResult = searchParams.get('checkout');

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch<BillingStatus>('/api/billing/status');
      setStatus(res);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger le statut de facturation.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubscribe() {
    setError(null);
    setIsRedirecting(true);
    try {
      const res = await authFetch<{ url: string }>('/api/billing/checkout', { method: 'POST' });
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'ouvrir la page de paiement.");
      setIsRedirecting(false);
    }
  }

  async function handleManage() {
    setError(null);
    setIsRedirecting(true);
    try {
      const res = await authFetch<{ url: string }>('/api/billing/portal', { method: 'POST' });
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'ouvrir le portail de facturation.");
      setIsRedirecting(false);
    }
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Chargement…</div>;
  }

  const hasActiveOrTrialing = status?.subscriptionStatus === 'ACTIVE' || status?.subscriptionStatus === 'TRIALING';
  const badge = status?.subscriptionStatus ? STATUS_LABELS[status.subscriptionStatus] : null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Abonnement</h1>

        {checkoutResult === 'success' && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
            Paiement enregistré — merci ! Le statut ci-dessous se met à jour automatiquement.
          </p>
        )}
        {checkoutResult === 'cancelled' && (
          <p className="text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 mb-4">
            Paiement annulé, aucun montant n'a été prélevé.
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          {!status?.billingConfigured ? (
            <p className="text-sm text-slate-500">
              La facturation en ligne n'est pas encore activée sur ce déploiement.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm font-medium text-slate-700">Statut :</span>
                {badge ? (
                  <span className={`text-xs font-medium px-2 py-1 rounded-full border ${badge.className}`}>
                    {badge.label}
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2 py-1 rounded-full border bg-slate-100 text-slate-600 border-slate-200">
                    Aucun abonnement
                  </span>
                )}
              </div>

              {status.subscriptionCurrentPeriodEnd && (
                <p className="text-sm text-slate-500 mb-4">
                  {status.subscriptionStatus === 'CANCELED' ? 'Accès jusqu\'au' : 'Prochain renouvellement le'}{' '}
                  {new Date(status.subscriptionCurrentPeriodEnd).toLocaleDateString('fr-FR')}
                </p>
              )}

              {hasActiveOrTrialing ? (
                <button
                  onClick={handleManage}
                  disabled={isRedirecting}
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 text-slate-700 font-medium disabled:opacity-50"
                >
                  {isRedirecting ? 'Redirection…' : 'Gérer mon abonnement'}
                </button>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={isRedirecting}
                  className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
                >
                  {isRedirecting ? 'Redirection…' : "S'abonner"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
