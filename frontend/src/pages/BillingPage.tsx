import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import Badge, { type BadgeTone } from '../components/Badge';

interface BillingStatus {
  billingConfigured: boolean;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  TRIALING: "Période d'essai",
  PAST_DUE: 'Paiement en retard',
  UNPAID: 'Impayé',
  CANCELED: 'Résilié',
  INCOMPLETE: 'Incomplet',
  INCOMPLETE_EXPIRED: 'Expiré sans paiement',
  PAUSED: 'En pause',
};

// Même mapping que celui déjà en place dans l'original (émeraude,
// bleu, ambre, rouge, ardoise), traduit vers les 5 tons du système.
const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  TRIALING: 'info',
  PAST_DUE: 'attention',
  UNPAID: 'danger',
  CANCELED: 'neutral',
  INCOMPLETE: 'attention',
  INCOMPLETE_EXPIRED: 'neutral',
  PAUSED: 'neutral',
};

const primaryBtnClass =
  'w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';
const secondaryBtnClass =
  'w-full min-h-[44px] rounded-card-md border border-border text-text font-medium hover:border-border-strong disabled:opacity-50';

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
    return <p className="text-text-faint">Chargement…</p>;
  }

  const hasActiveOrTrialing = status?.subscriptionStatus === 'ACTIVE' || status?.subscriptionStatus === 'TRIALING';

  return (
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-text-muted hover:text-accent">
        ← Retour à l'accueil
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-6">Abonnement</h2>

      {checkoutResult === 'success' && (
        <p className="text-sm text-good bg-good-soft border border-good/30 rounded-card-md px-3 py-2 mb-4">
          Paiement enregistré — merci ! Le statut ci-dessous se met à jour automatiquement.
        </p>
      )}
      {checkoutResult === 'cancelled' && (
        <p className="text-sm text-text-muted bg-surface-hover border border-border rounded-card-md px-3 py-2 mb-4">
          Paiement annulé, aucun montant n'a été prélevé.
        </p>
      )}
      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-4">{error}</p>
      )}

      <div className="bg-surface border border-border rounded-card-lg shadow-card p-6">
        {!status?.billingConfigured ? (
          <p className="text-sm text-text-muted">
            La facturation en ligne n'est pas encore activée sur ce déploiement.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium text-text-muted">Statut :</span>
              {status.subscriptionStatus && STATUS_LABELS[status.subscriptionStatus] ? (
                <Badge tone={STATUS_TONE[status.subscriptionStatus]}>{STATUS_LABELS[status.subscriptionStatus]}</Badge>
              ) : (
                <Badge tone="neutral">Aucun abonnement</Badge>
              )}
            </div>

            {status.subscriptionCurrentPeriodEnd && (
              <p className="text-sm text-text-muted mb-4">
                {status.subscriptionStatus === 'CANCELED' ? 'Accès jusqu\'au' : 'Prochain renouvellement le'}{' '}
                {new Date(status.subscriptionCurrentPeriodEnd).toLocaleDateString('fr-FR')}
              </p>
            )}

            {hasActiveOrTrialing ? (
              <button onClick={handleManage} disabled={isRedirecting} className={secondaryBtnClass}>
                {isRedirecting ? 'Redirection…' : 'Gérer mon abonnement'}
              </button>
            ) : (
              <button onClick={handleSubscribe} disabled={isRedirecting} className={primaryBtnClass}>
                {isRedirecting ? 'Redirection…' : "S'abonner"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
