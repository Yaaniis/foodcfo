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
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Chargement…</div>;
  }
  if (!invoice) {
    return <div className="min-h-screen flex items-center justify-center text-red-600">Facture introuvable.</div>;
  }

  const isEditable = invoice.status !== 'VALIDATED';

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/invoices" className="text-sm text-slate-500 underline">
          ← Retour aux factures
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-1">Facture</h1>

        {invoice.status === 'ERROR' && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 my-3">
            Extraction automatique indisponible : {invoice.errorMessage}. Saisis les lignes manuellement ci-dessous.
          </p>
        )}
        {invoice.status === 'VALIDATED' && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 my-3">
            Facture validée — les prix des produits et l'historique ont été mis à jour.
          </p>
        )}
        {validationSummary && (
          <p className="text-sm text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 my-3">
            {validationSummary}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 my-3">{error}</p>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Fournisseur</label>
          <div className="flex gap-2">
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={!isEditable}
              className="flex-1 min-h-[44px] rounded-lg border border-slate-300 px-3 disabled:bg-slate-50"
            >
              <option value="">Choisir un fournisseur…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {isEditable && supplierId !== (invoice.supplier?.id ?? '') && (
              <button
                onClick={handleSetSupplier}
                className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium"
              >
                Associer
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
          <p className="text-sm font-medium text-slate-700 mb-3">Lignes produits</p>
          <div className="space-y-3">
            {invoice.lineItems.map((line) => (
              <div key={line.id} className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm text-slate-500 mb-2">{line.rawLabel}</p>
                <div className="flex gap-2 items-center">
                  <select
                    value={line.productId ?? ''}
                    onChange={(e) => handleLineProductChange(line.id, e.target.value)}
                    disabled={!isEditable}
                    className="flex-1 min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50"
                  >
                    <option value="">Non rapproché — choisir un produit…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-600 shrink-0 w-32 text-right">
                    {Number(line.quantity)} {line.product ? UNIT_LABELS[line.product.unit] : ''} ·{' '}
                    {Number(line.unitPriceHT).toFixed(2)} €
                  </span>
                  {isEditable && (
                    <button onClick={() => handleDeleteLine(line.id)} className="min-h-[44px] px-2 text-red-600">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            {invoice.lineItems.length === 0 && <p className="text-sm text-slate-400">Aucune ligne pour l'instant.</p>}
          </div>

          {isEditable && (
            <form onSubmit={handleAddLine} className="mt-4 pt-4 border-t border-slate-200 space-y-2">
              <p className="text-sm font-medium text-slate-700">Ajouter une ligne</p>
              <input
                placeholder="Libellé (ex: Filet de bœuf 5kg)"
                required
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
              />
              <select
                value={newProductId}
                onChange={(e) => setNewProductId(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
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
                  className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
                />
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="Prix unitaire HT"
                  required
                  value={newUnitPrice}
                  onChange={(e) => setNewUnitPrice(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>
              <button type="submit" className="w-full min-h-[44px] rounded-lg border border-slate-300 font-medium">
                + Ajouter la ligne
              </button>
            </form>
          )}
        </div>

        {isEditable && (
          <button
            onClick={handleValidate}
            disabled={isValidating}
            className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
          >
            {isValidating ? 'Validation…' : 'Valider la facture'}
          </button>
        )}
      </div>
    </div>
  );
}
