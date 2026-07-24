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
  const { authFetch } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierCategory, setSupplierCategory] = useState('');
  const [supplierChannel, setSupplierChannel] = useState('EMAIL');

  const [showProductForm, setShowProductForm] = useState(false);
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('KG');
  const [productPrice, setProductPrice] = useState('');
  const [productSupplierId, setProductSupplierId] = useState('');

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
    }
  }

  async function handleCreateProduct(e: FormEvent) {
    e.preventDefault();
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
              <button type="submit" className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium">
                Créer ce fournisseur
              </button>
            </form>
          )}

          {isLoading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : (
            <ul className="space-y-2">
              {suppliers.map((s) => (
                <li key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="text-sm text-slate-500">
                    {s.category} · {CHANNEL_LABELS[s.preferredChannel]}
                  </p>
                </li>
              ))}
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
              <button type="submit" className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium">
                Créer ce produit
              </button>
            </form>
          )}

          {isLoading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : (
            <ul className="space-y-2">
              {products.map((p) => (
                <li key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{p.name}</p>
                    <p className="text-sm text-slate-500 truncate">{p.supplier.name}</p>
                  </div>
                  <p className="shrink-0 text-sm text-slate-700">
                    {Number(p.currentPriceHT).toFixed(2)} € / {UNIT_LABELS[p.unit]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
