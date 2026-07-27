import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Impossible de supprimer ce produit.',
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <Link to="/menu" className="text-sm text-slate-500 underline">
          ← Retour à la carte
        </Link>

        {error && <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900">Fournisseurs</h1>
            <button
              onClick={() => setShowSupplierForm((v) => !v)}
              className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium"
            >
              {showSupplierForm ? 'Annuler' : '+ Ajouter'}
            </button>
          </div>

          {showSupplierForm && (
            <form
              onSubmit={handleCreateSupplier}
              className="bg-white rounded-2xl border border-slate-200 p-6 mb-4 space-y-3"
            >
              <input
                placeholder="Nom (ex: Boucherie Fontaine)"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
              <input
                placeholder="Catégorie (ex: Boucherie)"
                required
                value={supplierCategory}
                onChange={(e) => setSupplierCategory(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
              <select
                value={supplierChannel}
                onChange={(e) => setSupplierChannel(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
              >
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isCreatingSupplier}
                className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
              >
                {isCreatingSupplier ? 'Création…' : 'Créer ce fournisseur'}
              </button>
            </form>
          )}

          {isLoading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : (
            <ul className="space-y-2">
              {suppliers.map((s) =>
                editingSupplierId === s.id ? (
                  <li key={s.id}>
                    <form
                      onSubmit={(e) => handleUpdateSupplier(e, s.id)}
                      className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
                    >
                      <input
                        required
                        value={editSupplierName}
                        onChange={(e) => setEditSupplierName(e.target.value)}
                        className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                      />
                      <input
                        required
                        value={editSupplierCategory}
                        onChange={(e) => setEditSupplierCategory(e.target.value)}
                        className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                      />
                      <select
                        value={editSupplierChannel}
                        onChange={(e) => setEditSupplierChannel(e.target.value)}
                        className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                      >
                        {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="flex-1 min-h-[44px] rounded-lg bg-slate-900 text-white font-medium"
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSupplierId(null)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-300 font-medium"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{s.name}</p>
                      <p className="text-sm text-slate-500">
                        {s.category} · {CHANNEL_LABELS[s.preferredChannel]}
                      </p>
                    </div>
                    <div className="shrink-0 flex gap-2">
                      <button
                        onClick={() => startEditSupplier(s)}
                        className="min-h-[44px] px-3 rounded-lg border border-slate-300 text-sm font-medium"
                      >
                        Modifier
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteSupplier(s.id)}
                          className="min-h-[44px] px-3 rounded-lg border border-red-200 text-red-600 text-sm font-medium"
                        >
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
            <h2 className="text-2xl font-bold text-slate-900">Produits</h2>
            <button
              onClick={() => setShowProductForm((v) => !v)}
              disabled={suppliers.length === 0}
              className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
            >
              {showProductForm ? 'Annuler' : '+ Ajouter'}
            </button>
          </div>

          {suppliers.length === 0 && (
            <p className="text-sm text-slate-400 mb-4">
              Ajoutez d'abord un fournisseur pour pouvoir créer des produits.
            </p>
          )}

          {showProductForm && (
            <form
              onSubmit={handleCreateProduct}
              className="bg-white rounded-2xl border border-slate-200 p-6 mb-4 space-y-3"
            >
              <select
                required
                value={productSupplierId}
                onChange={(e) => setProductSupplierId(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
              >
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
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={productUnit}
                  onChange={(e) => setProductUnit(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                >
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
                  className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                />
              </div>
              <button
                type="submit"
                disabled={isCreatingProduct}
                className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
              >
                {isCreatingProduct ? 'Création…' : 'Créer ce produit'}
              </button>
            </form>
          )}

          {isLoading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : (
            <ul className="space-y-2">
              {products.map((p) =>
                editingProductId === p.id ? (
                  <li key={p.id}>
                    <form
                      onSubmit={(e) => handleUpdateProduct(e, p.id)}
                      className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
                    >
                      <input
                        required
                        value={editProductName}
                        onChange={(e) => setEditProductName(e.target.value)}
                        className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={editProductUnit}
                          onChange={(e) => setEditProductUnit(e.target.value)}
                          className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                        >
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
                          className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="flex-1 min-h-[44px] rounded-lg bg-slate-900 text-white font-medium"
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProductId(null)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-300 font-medium"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-sm text-slate-500 truncate">{p.supplier.name}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <p className="text-sm text-slate-700 whitespace-nowrap">
                        {Number(p.currentPriceHT).toFixed(2)} € / {UNIT_LABELS[p.unit]}
                      </p>
                      <button
                        onClick={() => startEditProduct(p)}
                        className="min-h-[44px] px-3 rounded-lg border border-slate-300 text-sm font-medium"
                      >
                        Modifier
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="min-h-[44px] px-3 rounded-lg border border-red-200 text-red-600 text-sm font-medium"
                        >
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
    </div>
  );
}
