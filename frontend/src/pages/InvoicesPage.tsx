import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import Badge, { type BadgeTone } from '../components/Badge';
import EmptyState from '../components/EmptyState';

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

// Les 5 statuts couvrent exactement les 5 tons du système — même
// mapping que celui construit dans l'artefact pour ce même statut.
const STATUS_TONE: Record<Invoice['status'], BadgeTone> = {
  UPLOADED: 'neutral',
  PROCESSING: 'info',
  PENDING_REVIEW: 'attention',
  VALIDATED: 'success',
  ERROR: 'danger',
};

const TABLE_COLS = 'grid-cols-[1fr_100px_90px_150px]';

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
    <div className="max-w-3xl">
      <h2 className="font-display text-2xl font-bold tracking-tight mb-6">Factures fournisseurs</h2>

      <form onSubmit={handleUpload} className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6 space-y-3">
        <p className="text-sm font-medium text-text-muted">Ajouter une facture</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="w-full text-sm text-text-muted file:mr-3 file:py-2.5 file:px-4 file:rounded-card-md file:border-0 file:bg-accent file:text-accent-text file:font-medium file:cursor-pointer hover:file:brightness-105"
        />
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        >
          <option value="">Fournisseur (optionnel, à préciser si besoin plus tard)</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
        )}
        <button
          type="submit"
          disabled={isUploading}
          className="w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium disabled:opacity-50 hover:brightness-105"
        >
          {isUploading ? 'Envoi et analyse…' : 'Envoyer la facture'}
        </button>
      </form>

      {isLoading && <p className="text-text-faint">Chargement…</p>}

      {!isLoading && invoices.length === 0 && (
        <div className="bg-surface border border-border rounded-card-lg shadow-card">
          <EmptyState
            title="Aucune facture pour l'instant"
            description="Envoyez une première facture ci-dessus — elle sera analysée automatiquement."
          />
        </div>
      )}

      {invoices.length > 0 && (
        <div className="bg-surface border border-border rounded-card-lg shadow-card overflow-hidden">
          <div className={`grid ${TABLE_COLS} gap-3 px-5 pb-2.5 pt-4 text-xs font-semibold uppercase tracking-wide text-text-faint`}>
            <span>Fournisseur</span>
            <span>Date</span>
            <span className="text-right">Montant</span>
            <span>Statut</span>
          </div>
          {invoices.map((invoice) => (
            <Link
              key={invoice.id}
              to={`/invoices/${invoice.id}`}
              className={`grid ${TABLE_COLS} gap-3 items-center px-5 py-3.5 border-t border-border hover:bg-surface-hover transition-colors`}
            >
              <span className="font-medium truncate">{invoice.supplier?.name ?? 'Fournisseur non renseigné'}</span>
              <span className="text-sm text-text-muted tabular-nums">
                {new Date(invoice.createdAt).toLocaleDateString('fr-FR')}
              </span>
              <span className="text-sm text-text tabular-nums text-right">
                {invoice.totalAmount ? `${Number(invoice.totalAmount).toFixed(2)} €` : '—'}
              </span>
              <span>
                <Badge tone={STATUS_TONE[invoice.status]}>{STATUS_LABELS[invoice.status]}</Badge>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
