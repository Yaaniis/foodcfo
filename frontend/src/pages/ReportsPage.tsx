import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

export default function ReportsPage() {
  const { authFetch, accessToken } = useAuth();

  const [data, setData] = useState<ReportData | null>(null);
  const [email, setEmail] = useState<ReportEmail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Rapports et exports</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}
        {sendResult && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
            {sendResult}
          </p>
        )}

        {data && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
            <p className="text-sm font-medium text-slate-700 mb-3">Rapport mensuel — {data.month}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-slate-500">Marge moyenne</p>
                <p className="text-lg font-bold text-slate-900">
                  {data.averageMarginRatio !== null ? `${data.averageMarginRatio.toFixed(1)} %` : '—'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-slate-500">Plats en alerte</p>
                <p className="text-lg font-bold text-slate-900">{data.orangeCount + data.redCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-slate-500">Gaspillage</p>
                <p className="text-lg font-bold text-slate-900">{data.wasteTotal.toFixed(2)} €</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-slate-500">Achats fournisseurs</p>
                <p className="text-lg font-bold text-slate-900">
                  {data.invoiceCount} facture(s) · {data.invoiceTotal.toFixed(2)} €
                </p>
              </div>
            </div>

            {email && (
              <details className="mb-4">
                <summary className="text-sm text-slate-500 underline cursor-pointer">Voir le message généré</summary>
                <pre className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 mt-2">
                  {email.text}
                </pre>
              </details>
            )}

            <button
              onClick={handleSend}
              disabled={isSending}
              className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
            >
              {isSending ? 'Envoi…' : 'Envoyer le rapport maintenant'}
            </button>
            <p className="text-xs text-slate-400 mt-2">
              Un rapport est aussi envoyé automatiquement le 1er de chaque mois à tous les comptes Gérant.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <p className="text-sm font-medium text-slate-700 mb-3">Export comptable</p>
          <p className="text-sm text-slate-500 mb-4">
            Toutes les lignes de factures validées du mois en cours, au format CSV (compatible Excel).
          </p>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full min-h-[44px] rounded-lg border border-slate-300 text-slate-700 font-medium disabled:opacity-50"
          >
            {isExporting ? 'Génération…' : 'Télécharger le CSV des factures'}
          </button>
        </div>
      </div>
    </div>
  );
}
