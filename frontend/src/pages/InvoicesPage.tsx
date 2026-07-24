import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface Invoice {
  id: string;
  status: 'UPLOADED' | 'PROCESSING' | 'PENDING_REVIEW' | 'VALIDATED' | 'ERROR';
  invoiceDate: string | null;
  totalAmount: string | null;
  errorMessage: string | null;
  supplier: { id: string; name: string } | null;
  lineItems: unknown[];
  createdAt: string;
}

interface Supplier {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<Invoice['status'], string> = {
  UPLOADED: 'Envoyée',
  PROCESSING: 'Analyse en cours…',
  PENDING_REVIEW: 'À valider',
  VALIDATED: 'Validée',
  ERROR: 'Extraction échouée — saisie manuelle',
};

const STATUS_STYLES: Record<Invoice['status'], string> = {
  UPLOADED: 'bg-slate-100 text-slate-700',
  PROCESSING: 'bg-slate-100 text-slate-700',
  PENDING_REVIEW: 'bg-amber-50 text-amber-700 border border-amber-200',
  VALIDATED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  ERROR: 'bg-red-50 text-red-700 border border-red-200',
};

export default function InvoicesPage() {
  const { authFetch } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [invoicesData, suppliersData] = await Promise.all([
        authFetch<{ invoices: Invoice[] }>('/api/invoices'),
        authFetch<{ suppliers: Supplier[] }>('/api/suppliers'),
      ]);
      setInvoices(invoicesData.invoices);
      setSuppliers(suppliersData.suppliers);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger les factures.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Choisis un fichier (PDF, JPG ou PNG).');
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (supplierId) formData.append('supplierId', supplierId);

      await authFetch('/api/invoices', { method: 'POST', body: formData });
      setSupplierId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'envoyer la facture.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Factures fournisseurs</h1>

        <form onSubmit={handleUpload} className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-3">
          <p className="text-sm font-medium text-slate-700">Ajouter une facture</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="w-full text-sm"
          />
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
          >
            <option value="">Fournisseur (optionnel, à préciser si besoin plus tard)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={isUploading}
            className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
          >
            {isUploading ? 'Envoi et analyse…' : 'Envoyer la facture'}
          </button>
        </form>

        {isLoading && <p className="text-slate-500">Chargement…</p>}

        <ul className="space-y-2">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                to={`/invoices/${invoice.id}`}
                className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {invoice.supplier?.name ?? 'Fournisseur non renseigné'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(invoice.createdAt).toLocaleDateString('fr-FR')}
                      {invoice.totalAmount && ` · ${Number(invoice.totalAmount).toFixed(2)} €`}
                      {` · ${invoice.lineItems.length} ligne(s)`}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg ${STATUS_STYLES[invoice.status]}`}>
                    {STATUS_LABELS[invoice.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {!isLoading && invoices.length === 0 && (
            <p className="text-slate-500">Aucune facture pour l'instant.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
