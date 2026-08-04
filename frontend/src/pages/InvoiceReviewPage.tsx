import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface Product {
  id: string;
  name: string;
  unit: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface InvoiceLine {
  id: string;
  rawLabel: string;
  productId: string | null;
  quantity: string;
  unitPriceHT: string;
  totalPriceHT: string;
  wasManuallyEdited: boolean;
  product: Product | null;
}

interface InvoiceDetail {
  id: string;
  status: 'UPLOADED' | 'PROCESSING' | 'PENDING_REVIEW' | 'VALIDATED' | 'ERROR';
  errorMessage: string | null;
  invoiceDate: string | null;
  totalAmount: string | null;
  supplier: Supplier | null;
  lineItems: InvoiceLine[];
}

const UNIT_LABELS: Record<string, string> = { KG: 'kg', G: 'g', L: 'L', ML: 'mL', UNITE: 'unité' };

const inputClass =
  'flex-1 min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-surface-hover disabled:text-text-faint disabled:cursor-not-allowed';
const primaryBtnClass = 'min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium disabled:opacity-50 hover:brightness-105';
const secondaryBtnClass = 'min-h-[44px] px-4 rounded-card-md border border-border text-sm font-medium hover:border-border-strong';

export default function InvoiceReviewPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { authFetch } = useAuth();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationSummary, setValidationSummary] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newProductId, setNewProductId] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('');
  const [isAddingLine, setIsAddingLine] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [invoiceData, productsData, suppliersData] = await Promise.all([
        authFetch<{ invoice: InvoiceDetail }>(`/api/invoices/${invoiceId}`),
        authFetch<{ products: Product[] }>('/api/products'),
        authFetch<{ suppliers: Supplier[] }>('/api/suppliers'),
      ]);
      setInvoice(invoiceData.invoice);
      setProducts(productsData.products);
      setSuppliers(suppliersData.suppliers);
      setSupplierId(invoiceData.invoice.supplier?.id ?? '');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger la facture.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function handleSetSupplier() {
    if (!supplierId || supplierId === invoice?.supplier?.id) return;
    try {
      await authFetch(`/api/invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify({ supplierId }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'associer ce fournisseur.");
    }
  }

  async function handleLineProductChange(lineId: string, productId: string) {
    try {
      await authFetch(`/api/invoices/${invoiceId}/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ productId: productId || null }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de mettre à jour cette ligne.');
    }
  }

  async function handleDeleteLine(lineId: string) {
    try {
      await authFetch(`/api/invoices/${invoiceId}/lines/${lineId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de supprimer cette ligne.');
    }
  }

  async function handleAddLine(e: FormEvent) {
    e.preventDefault();
    setIsAddingLine(true);
    try {
      const quantity = Number(newQuantity);
      const unitPriceHT = Number(newUnitPrice);
      await authFetch(`/api/invoices/${invoiceId}/lines`, {
        method: 'POST',
        body: JSON.stringify({
          rawLabel: newLabel,
          productId: newProductId || null,
          quantity,
          unitPriceHT,
          totalPriceHT: quantity * unitPriceHT,
        }),
      });
      setNewLabel('');
      setNewProductId('');
      setNewQuantity('');
      setNewUnitPrice('');
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'ajouter cette ligne.");
    } finally {
      setIsAddingLine(false);
    }
  }

  async function handleValidate() {
    setError(null);
    setValidationSummary(null);
    setIsValidating(true);
    try {
      const res = await authFetch<{
        invoice: InvoiceDetail;
        alertsGenerated: { productName: string; increasePercent: number }[];
      }>(`/api/invoices/${invoiceId}/validate`, { method: 'POST' });
      setInvoice(res.invoice);
      setValidationSummary(
        res.alertsGenerated.length > 0
          ? `Facture validée. ${res.alertsGenerated.length} alerte(s) de hausse de prix générée(s) : ${res.alertsGenerated
              .map((a) => `${a.productName} (+${a.increasePercent.toFixed(1)} %)`)
              .join(', ')}.`
          : 'Facture validée. Aucune hausse de prix anormale détectée.',
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de valider cette facture.');
    } finally {
      setIsValidating(false);
    }
  }

  if (isLoading) {
    return <p className="text-text-faint">Chargement…</p>;
  }
  if (!invoice) {
    // error distingue une vraie erreur réseau/serveur (message précis,
    // souvent temporaire — wifi cuisine peu fiable) d'une facture
    // réellement introuvable — sans ça, une simple coupure réseau
    // affichait le même message qu'une suppression, sans jamais
    // proposer de réessayer.
    return (
      <div className="flex flex-col items-center gap-3 text-center px-4 py-12">
        <p className="text-danger">{error ?? 'Facture introuvable.'}</p>
        <button onClick={() => load()} className={secondaryBtnClass}>
          Réessayer
        </button>
      </div>
    );
  }

  const isEditable = invoice.status !== 'VALIDATED';

  return (
    <div className="max-w-3xl">
      <Link to="/invoices" className="text-sm text-text-muted hover:text-accent">
        ← Retour aux factures
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-1">Facture</h2>

      {invoice.status === 'ERROR' && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 my-3">
          Extraction automatique indisponible : {invoice.errorMessage}. Saisis les lignes manuellement ci-dessous.
        </p>
      )}
      {invoice.status === 'VALIDATED' && (
        <p className="text-sm text-good bg-good-soft border border-good/30 rounded-card-md px-3 py-2 my-3">
          Facture validée — les prix des produits et l'historique ont été mis à jour.
        </p>
      )}
      {validationSummary && (
        <p className="text-sm text-text-muted bg-surface-hover border border-border rounded-card-md px-3 py-2 my-3">
          {validationSummary}
        </p>
      )}
      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 my-3">{error}</p>
      )}

      <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-4">
        <label className="block text-sm font-medium text-text-muted mb-1">Fournisseur</label>
        <div className="flex gap-2">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            disabled={!isEditable}
            className={inputClass}
          >
            <option value="">Choisir un fournisseur…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {isEditable && supplierId !== (invoice.supplier?.id ?? '') && (
            <button onClick={handleSetSupplier} className={primaryBtnClass}>
              Associer
            </button>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-4">
        <p className="text-sm font-medium text-text-muted mb-3">Lignes produits</p>
        <div className="space-y-3">
          {invoice.lineItems.map((line) => (
            <div key={line.id} className="border border-border rounded-card-md p-3">
              <p className="text-sm text-text-faint mb-2">{line.rawLabel}</p>
              <div className="flex gap-2 items-center">
                <select
                  value={line.productId ?? ''}
                  onChange={(e) => handleLineProductChange(line.id, e.target.value)}
                  disabled={!isEditable}
                  className={inputClass}
                >
                  <option value="">Non rapproché — choisir un produit…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-text-muted tabular-nums shrink-0 w-32 text-right">
                  {Number(line.quantity)} {line.product ? UNIT_LABELS[line.product.unit] : ''} ·{' '}
                  {Number(line.unitPriceHT).toFixed(2)} €
                </span>
                {isEditable && (
                  <button onClick={() => handleDeleteLine(line.id)} className="min-h-[44px] px-2 text-danger hover:brightness-110">
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          {invoice.lineItems.length === 0 && <p className="text-sm text-text-faint">Aucune ligne pour l'instant.</p>}
        </div>

        {isEditable && (
          <form onSubmit={handleAddLine} className="mt-4 pt-4 border-t border-border space-y-2">
            <p className="text-sm font-medium text-text-muted">Ajouter une ligne</p>
            <input
              placeholder="Libellé (ex: Filet de bœuf 5kg)"
              required
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
            <select
              value={newProductId}
              onChange={(e) => setNewProductId(e.target.value)}
              className="w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            >
              <option value="">Produit (à rapprocher maintenant ou plus tard)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.0001"
                min="0"
                placeholder="Quantité"
                required
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                className="min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
              <input
                type="number"
                step="0.0001"
                min="0"
                placeholder="Prix unitaire HT"
                required
                value={newUnitPrice}
                onChange={(e) => setNewUnitPrice(e.target.value)}
                className="min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>
            <button type="submit" disabled={isAddingLine} className={`w-full ${secondaryBtnClass}`}>
              {isAddingLine ? 'Ajout…' : '+ Ajouter la ligne'}
            </button>
          </form>
        )}
      </div>

      {isEditable && (
        <button onClick={handleValidate} disabled={isValidating} className={`w-full ${primaryBtnClass}`}>
          {isValidating ? 'Validation…' : 'Valider la facture'}
        </button>
      )}
    </div>
  );
}
