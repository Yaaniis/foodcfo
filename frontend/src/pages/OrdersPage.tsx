import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface Product {
  id: string;
  name: string;
  unit: string;
  supplier: { id: string; name: string };
}

interface Order {
  id: string;
  status: 'DRAFT' | 'SENT' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
  supplier: { id: string; name: string };
  lineItems: unknown[];
  createdAt: string;
}

const UNIT_LABELS: Record<string, string> = { KG: 'kg', G: 'g', L: 'L', ML: 'mL', UNITE: 'unité(s)' };

const STATUS_LABELS: Record<Order['status'], string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  CONFIRMED: 'Confirmée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};

const STATUS_STYLES: Record<Order['status'], string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-amber-50 text-amber-700 border border-amber-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border border-blue-200',
  DELIVERED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 border border-red-200',
};

export default function OrdersPage() {
  const { authFetch } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [ordersData, productsData, suggestionsData] = await Promise.all([
        authFetch<{ orders: Order[] }>('/api/orders'),
        authFetch<{ products: Product[] }>('/api/products'),
        authFetch<{ suggestions: Record<string, number> }>('/api/orders/suggestions'),
      ]);
      setOrders(ordersData.orders);
      setProducts(productsData.products);
      setSuggestions(suggestionsData.suggestions);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger les commandes.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCart() {
    // Pré-remplit chaque produit avec la quantité de sa dernière
    // commande, quand elle existe (suggestion basée sur l'historique).
    const initial: Record<string, string> = {};
    for (const p of products) {
      if (suggestions[p.id] !== undefined) initial[p.id] = String(suggestions[p.id]);
    }
    setQuantities(initial);
    setShowCart(true);
  }

  async function handleCreateOrders(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty && Number(qty) > 0)
      .map(([productId, qty]) => ({ productId, quantity: Number(qty) }));

    if (items.length === 0) {
      setError('Renseigne au moins une quantité.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authFetch('/api/orders/from-cart', { method: 'POST', body: JSON.stringify({ items }) });
      setShowCart(false);
      setQuantities({});
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de créer la commande.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const productsBySupplier = products.reduce<Record<string, Product[]>>((acc, p) => {
    (acc[p.supplier.name] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <div className="flex items-center justify-between mt-2 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Commandes fournisseurs</h1>
          <button
            onClick={() => (showCart ? setShowCart(false) : openCart())}
            className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium"
          >
            {showCart ? 'Annuler' : '+ Nouvelle commande'}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        {showCart && (
          <form onSubmit={handleCreateOrders} className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-4">
            <p className="text-sm text-slate-500">
              Renseigne les quantités à commander. Une commande brouillon distincte sera créée par fournisseur.
            </p>
            {Object.entries(productsBySupplier).map(([supplierName, supplierProducts]) => (
              <div key={supplierName}>
                <p className="text-sm font-semibold text-slate-700 mb-2">{supplierName}</p>
                <div className="space-y-2">
                  {supplierProducts.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-slate-600 truncate">{p.name}</span>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        placeholder="0"
                        value={quantities[p.id] ?? ''}
                        onChange={(e) => setQuantities((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        className="w-24 min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm"
                      />
                      <span className="text-xs text-slate-400 w-14">{UNIT_LABELS[p.unit]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {products.length === 0 && <p className="text-sm text-slate-400">Aucun produit disponible.</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Création…' : 'Créer la/les commande(s)'}
            </button>
          </form>
        )}

        {isLoading && <p className="text-slate-500">Chargement…</p>}

        <ul className="space-y-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                to={`/orders/${order.id}`}
                className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{order.supplier.name}</p>
                    <p className="text-sm text-slate-500">
                      {new Date(order.createdAt).toLocaleDateString('fr-FR')} · {order.lineItems.length} ligne(s)
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg ${STATUS_STYLES[order.status]}`}>
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {!isLoading && orders.length === 0 && <p className="text-slate-500">Aucune commande pour l'instant.</p>}
        </ul>
      </div>
    </div>
  );
}
