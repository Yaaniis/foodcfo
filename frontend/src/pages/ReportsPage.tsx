import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

interface ReportData {
  restaurantName: string;
  month: string;
  averageMarginRatio: number | null;
  greenCount: number;
  orangeCount: number;
  redCount: number;
  potentialSavings: number;
  wasteTotal: number;
  invoiceCount: number;
  invoiceTotal: number;
}

interface ReportEmail {
  subject: string;
  text: string;
}

const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass =
  'w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';
const secondaryBtnClass =
  'w-full min-h-[44px] rounded-card-md border border-border text-text font-medium hover:border-border-strong disabled:opacity-50';

export default function ReportsPage() {
  const { authFetch, accessToken, logout } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<ReportData | null>(null);
  const [email, setEmail] = useState<ReportEmail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch<{ data: ReportData; email: ReportEmail }>('/api/reports/monthly/preview');
      setData(res.data);
      setEmail(res.email);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger le rapport.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    setError(null);
    setSendResult(null);
    setIsSending(true);
    try {
      const res = await authFetch<{ sentTo: number; failedCount: number }>('/api/reports/monthly/send', {
        method: 'POST',
      });
      setSendResult(`Rapport envoyé à ${res.sentTo} destinataire(s).`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'envoyer le rapport.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleExport() {
    setError(null);
    setIsExporting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/exports/invoices.csv`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) {
        throw new Error("Impossible de générer l'export.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `factures_${data?.month ?? 'export'}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Impossible de télécharger l'export comptable.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportAllData() {
    setError(null);
    setIsExportingData(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/restaurants/me/export`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) {
        throw new Error("Impossible de générer l'export.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `foodcfo-export-complet.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Impossible de télécharger vos données.');
    } finally {
      setIsExportingData(false);
    }
  }

  async function handleDeleteRestaurant() {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await authFetch('/api/restaurants/me', {
        method: 'DELETE',
        body: JSON.stringify({ confirmRestaurantName: confirmName }),
      });
      await logout();
      navigate('/login');
    } catch (err) {
      setDeleteError(err instanceof ApiRequestError ? err.message : 'Impossible de supprimer le restaurant.');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="text-text-faint">Chargement…</p>;
  }

  return (
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-text-muted hover:text-accent">
        ← Retour à l'accueil
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-6">Rapports et exports</h2>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-4">{error}</p>
      )}
      {sendResult && (
        <p className="text-sm text-good bg-good-soft border border-good/30 rounded-card-md px-3 py-2 mb-4">
          {sendResult}
        </p>
      )}

      {data && (
        <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-4">
          <p className="text-sm font-medium text-text-muted mb-3">Rapport mensuel — {data.month}</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-card-md bg-surface-hover">
              <p className="text-xs text-text-faint uppercase tracking-wide">Marge moyenne</p>
              <p className="text-lg font-bold font-display mt-0.5">
                {data.averageMarginRatio !== null ? `${data.averageMarginRatio.toFixed(1)} %` : '—'}
              </p>
            </div>
            <div className="p-3 rounded-card-md bg-warn-soft">
              <p className="text-xs text-warn uppercase tracking-wide">Plats en alerte</p>
              <p className="text-lg font-bold font-display text-warn mt-0.5">{data.orangeCount + data.redCount}</p>
            </div>
            <div className="p-3 rounded-card-md bg-surface-hover">
              <p className="text-xs text-text-faint uppercase tracking-wide">Gaspillage</p>
              <p className="text-lg font-bold font-display mt-0.5">{data.wasteTotal.toFixed(2)} €</p>
            </div>
            <div className="p-3 rounded-card-md bg-surface-hover">
              <p className="text-xs text-text-faint uppercase tracking-wide">Achats fournisseurs</p>
              <p className="text-lg font-bold font-display mt-0.5">
                {data.invoiceCount} facture(s) · {data.invoiceTotal.toFixed(2)} €
              </p>
            </div>
          </div>

          {email && (
            <details className="mb-4">
              <summary className="text-sm text-text-muted hover:text-accent cursor-pointer">Voir le message généré</summary>
              <pre className="text-sm text-text-muted whitespace-pre-wrap bg-surface-hover rounded-card-md p-3 mt-2">
                {email.text}
              </pre>
            </details>
          )}

          <button onClick={handleSend} disabled={isSending} className={primaryBtnClass}>
            {isSending ? 'Envoi…' : 'Envoyer le rapport maintenant'}
          </button>
          <p className="text-xs text-text-faint mt-2">
            Un rapport est aussi envoyé automatiquement le 1er de chaque mois à tous les comptes Gérant.
          </p>
        </div>
      )}

      <div className="bg-surface border border-border rounded-card-lg shadow-card p-6">
        <p className="text-sm font-medium text-text-muted mb-3">Export comptable</p>
        <p className="text-sm text-text-muted mb-4">
          Toutes les lignes de factures validées du mois en cours, au format CSV (compatible Excel).
        </p>
        <button onClick={handleExport} disabled={isExporting} className={secondaryBtnClass}>
          {isExporting ? 'Génération…' : 'Télécharger le CSV des factures'}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mt-4">
        <p className="text-sm font-medium text-text-muted mb-3">Confidentialité et données</p>
        <p className="text-sm text-text-muted mb-4">
          Conformément au RGPD, tu peux exporter l'intégralité des données de ton restaurant, ou demander leur
          suppression complète.
        </p>
        <button onClick={handleExportAllData} disabled={isExportingData} className={secondaryBtnClass}>
          {isExportingData ? 'Génération…' : 'Exporter toutes mes données (JSON)'}
        </button>
      </div>

      <div className="bg-surface border border-danger/30 rounded-card-lg shadow-card p-6 mt-4">
        <p className="text-sm font-medium text-danger mb-3">Zone de suppression</p>
        <p className="text-sm text-text-muted mb-4">
          Supprime définitivement le restaurant et toutes ses données (fournisseurs, produits, plats, factures,
          commandes, gaspillage, comptes de l'équipe). <strong className="text-text">Action irréversible.</strong> Pour
          confirmer, retape le nom exact du restaurant{data ? ` (« ${data.restaurantName} »)` : ''} ci-dessous.
        </p>
        <input
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder="Nom exact du restaurant"
          className={`${inputClass} mb-3`}
        />
        {deleteError && (
          <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-3">
            {deleteError}
          </p>
        )}
        <button
          onClick={handleDeleteRestaurant}
          disabled={isDeleting || !data || confirmName !== data.restaurantName}
          className="w-full min-h-[44px] rounded-card-md bg-danger text-text font-medium disabled:opacity-40 hover:brightness-110"
        >
          {isDeleting ? 'Suppression…' : 'Supprimer définitivement le restaurant'}
        </button>
      </div>
    </div>
  );
}
