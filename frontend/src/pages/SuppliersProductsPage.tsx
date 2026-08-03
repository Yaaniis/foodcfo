import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface Supplier {
  id: string;
  name: string;
  category: string;
  preferredChannel: string;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  currentPriceHT: string;
  supplier: { id: string; name: string };
}

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  PHONE: 'Téléphone',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  WEB_PORTAL: 'Portail web',
  FAX: 'Fax',
};

const UNIT_LABELS: Record<string, string> = {
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'mL',
  UNITE: 'unité',
};

const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass =
  'min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';
const secondaryBtnClass = 'min-h-[44px] px-3 rounded-card-md border border-border text-sm font-medium hover:border-border-strong';
const dangerBtnClass = 'min-h-[44px] px-3 rounded-card-md border border-danger/40 text-danger text-sm font-medium hover:bg-danger-soft';

export default function SuppliersProductsPage() {
  const { authFetch, user } = useAuth();
  const canDelete = user?.role === 'GERANT';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierCategory, setSupplierCategory] = useState('');
  const [supplierChannel, setSupplierChannel] = useState('EMAIL');
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);

  const [showProductForm, setShowProductForm] = useState(false);
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('KG');
  const [productPrice, setProductPrice] = useState('');
  const [productSupplierId, setProductSupplierId] = useState('');
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editSupplierCategory, setEditSupplierCategory] = useState('');
  const [editSupplierChannel, setEditSupplierChannel] = useState('EMAIL');

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductUnit, setEditProductUnit] = useState('KG');
  const [editProductPrice, setEditProductPrice] = useState('');

  async function loadAll() {
    setIsLoading(true);
    setError(null);
    try {
      const [suppliersData, productsData] = await Promise.all([
        authFetch<{ suppliers: Supplier[] }>('/api/suppliers'),
        authFetch<{ products: Product[] }>('/api/products'),
      ]);
      setSuppliers(suppliersData.suppliers);
      setProducts(productsData.products);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger les données.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateSupplier(e: FormEvent) {
    e.preventDefault();
    setIsCreatingSupplier(true);
    try {
      await authFetch('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify({ name: supplierName, category: supplierCategory, preferredChannel: supplierChannel }),
      });
      setSupplierName('');
      setSupplierCategory('');
      setShowSupplierForm(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de créer ce fournisseur.');
    } finally {
      setIsCreatingSupplier(false);
    }
  }

  async function handleCreateProduct(e: FormEvent) {
    e.preventDefault();
    setIsCreatingProduct(true);
    try {
      await authFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: productName,
          unit: productUnit,
          currentPriceHT: Number(productPrice),
          supplierId: productSupplierId,
        }),
      });
      setProductName('');
      setProductPrice('');
      setShowProductForm(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de créer ce produit.');
    } finally {
      setIsCreatingProduct(false);
    }
  }

  function startEditSupplier(s: Supplier) {
    setEditingSupplierId(s.id);
    setEditSupplierName(s.name);
    setEditSupplierCategory(s.category);
    setEditSupplierChannel(s.preferredChannel);
  }

  async function handleUpdateSupplier(e: FormEvent, id: string) {
    e.preventDefault();
    try {
      await authFetch(`/api/suppliers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editSupplierName, category: editSupplierCategory, preferredChannel: editSupplierChannel }),
      });
      setEditingSupplierId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de modifier ce fournisseur.');
    }
  }

  async function handleDeleteSupplier(id: string) {
    if (!window.confirm('Désactiver ce fournisseur ? Il disparaîtra des listes, mais son historique (factures, commandes passées) reste conservé.')) {
      return;
    }
    try {
      await authFetch(`/api/suppliers/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de désactiver ce fournisseur.');
    }
  }

  function startEditProduct(p: Product) {
    setEditingProductId(p.id);
    setEditProductName(p.name);
    setEditProductUnit(p.unit);
    setEditProductPrice(p.currentPriceHT);
  }

  async function handleUpdateProduct(e: FormEvent, id: string) {
    e.preventDefault();
    try {
      await authFetch(`/api/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editProductName, unit: editProductUnit, currentPriceHT: Number(editProductPrice) }),
      });
      setEditingProductId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de modifier ce produit.');
    }
  }

  async function handleDeleteProduct(id: string) {
    if (!window.confirm('Supprimer définitivement ce produit ?')) {
      return;
    }
    try {
      await authFetch(`/api/products/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de supprimer ce produit.');
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {error && (
        <p className="text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-bold tracking-tight">Fournisseurs</h2>
          <button onClick={() => setShowSupplierForm((v) => !v)} className={primaryBtnClass}>
            {showSupplierForm ? 'Annuler' : '+ Ajouter'}
          </button>
        </div>

        {showSupplierForm && (
          <form
            onSubmit={handleCreateSupplier}
            className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-4 space-y-3"
          >
            <input
              placeholder="Nom (ex: Boucherie Fontaine)"
              required
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder="Catégorie (ex: Boucherie)"
              required
              value={supplierCategory}
              onChange={(e) => setSupplierCategory(e.target.value)}
              className={inputClass}
            />
            <select value={supplierChannel} onChange={(e) => setSupplierChannel(e.target.value)} className={inputClass}>
              {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={isCreatingSupplier} className={`w-full ${primaryBtnClass}`}>
              {isCreatingSupplier ? 'Création…' : 'Créer ce fournisseur'}
            </button>
          </form>
        )}

        {isLoading ? (
          <p className="text-text-faint">Chargement…</p>
        ) : (
          <ul className="space-y-2">
            {suppliers.map((s) =>
              editingSupplierId === s.id ? (
                <li key={s.id}>
                  <form
                    onSubmit={(e) => handleUpdateSupplier(e, s.id)}
                    className="bg-surface border border-border rounded-card-lg shadow-card p-4 space-y-3"
                  >
                    <input required value={editSupplierName} onChange={(e) => setEditSupplierName(e.target.value)} className={inputClass} />
                    <input
                      required
                      value={editSupplierCategory}
                      onChange={(e) => setEditSupplierCategory(e.target.value)}
                      className={inputClass}
                    />
                    <select
                      value={editSupplierChannel}
                      onChange={(e) => setEditSupplierChannel(e.target.value)}
                      className={inputClass}
                    >
                      {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button type="submit" className={`flex-1 ${primaryBtnClass}`}>
                        Enregistrer
                      </button>
                      <button type="button" onClick={() => setEditingSupplierId(null)} className={`flex-1 ${secondaryBtnClass}`}>
                        Annuler
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li
                  key={s.id}
                  className="bg-surface border border-border rounded-card-lg shadow-card p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.name}</p>
                    <p className="text-sm text-text-faint">
                      {s.category} · {CHANNEL_LABELS[s.preferredChannel]}
                    </p>
                  </div>
                  <div className="shrink-0 flex gap-2">
                    <button onClick={() => startEditSupplier(s)} className={secondaryBtnClass}>
                      Modifier
                    </button>
                    {canDelete && (
                      <button onClick={() => handleDeleteSupplier(s.id)} className={dangerBtnClass}>
                        Désactiver
                      </button>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-bold tracking-tight">Produits</h2>
          <button onClick={() => setShowProductForm((v) => !v)} disabled={suppliers.length === 0} className={primaryBtnClass}>
            {showProductForm ? 'Annuler' : '+ Ajouter'}
          </button>
        </div>

        {suppliers.length === 0 && (
          <p className="text-sm text-text-faint mb-4">Ajoutez d'abord un fournisseur pour pouvoir créer des produits.</p>
        )}

        {showProductForm && (
          <form
            onSubmit={handleCreateProduct}
            className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-4 space-y-3"
          >
            <select required value={productSupplierId} onChange={(e) => setProductSupplierId(e.target.value)} className={inputClass}>
              <option value="">Choisir un fournisseur…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Nom du produit (ex: Filet de bœuf)"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-3">
              <select value={productUnit} onChange={(e) => setProductUnit(e.target.value)} className={inputClass}>
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.0001"
                min="0"
                placeholder="Prix HT"
                required
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                className={inputClass}
              />
            </div>
            <button type="submit" disabled={isCreatingProduct} className={`w-full ${primaryBtnClass}`}>
              {isCreatingProduct ? 'Création…' : 'Créer ce produit'}
            </button>
          </form>
        )}

        {isLoading ? (
          <p className="text-text-faint">Chargement…</p>
        ) : (
          <ul className="space-y-2">
            {products.map((p) =>
              editingProductId === p.id ? (
                <li key={p.id}>
                  <form
                    onSubmit={(e) => handleUpdateProduct(e, p.id)}
                    className="bg-surface border border-border rounded-card-lg shadow-card p-4 space-y-3"
                  >
                    <input required value={editProductName} onChange={(e) => setEditProductName(e.target.value)} className={inputClass} />
                    <div className="grid grid-cols-2 gap-3">
                      <select value={editProductUnit} onChange={(e) => setEditProductUnit(e.target.value)} className={inputClass}>
                        {Object.entries(UNIT_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        required
                        value={editProductPrice}
                        onChange={(e) => setEditProductPrice(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className={`flex-1 ${primaryBtnClass}`}>
                        Enregistrer
                      </button>
                      <button type="button" onClick={() => setEditingProductId(null)} className={`flex-1 ${secondaryBtnClass}`}>
                        Annuler
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li
                  key={p.id}
                  className="bg-surface border border-border rounded-card-lg shadow-card p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-sm text-text-faint truncate">{p.supplier.name}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <p className="text-sm text-text tabular-nums whitespace-nowrap">
                      {Number(p.currentPriceHT).toFixed(2)} € / {UNIT_LABELS[p.unit]}
                    </p>
                    <button onClick={() => startEditProduct(p)} className={secondaryBtnClass}>
                      Modifier
                    </button>
                    {canDelete && (
                      <button onClick={() => handleDeleteProduct(p.id)} className={dangerBtnClass}>
                        Supprimer
                      </button>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
