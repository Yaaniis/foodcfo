import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import Badge, { type BadgeTone } from '../components/Badge';
import EmptyState from '../components/EmptyState';

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

// Brouillon/Annulée = neutre (pas actif / clos, pas alarmant) ; Envoyée
// et Confirmée = info (en cours, rien à faire) ; Livrée = succès. Même
// mapping que celui validé dans l'artefact pour ce même statut.
const STATUS_TONE: Record<Order['status'], BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  CONFIRMED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
};

const TABLE_COLS = 'grid-cols-[1fr_110px_80px_120px]';

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
    <div className="max-w-3xl">
      <Link to="/suppliers" className="text-sm text-text-muted hover:text-accent">
        ← Retour aux fournisseurs
      </Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight">Commandes fournisseurs</h2>
        <button
          onClick={() => (showCart ? setShowCart(false) : openCart())}
          className="min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105"
        >
          {showCart ? 'Annuler' : '+ Nouvelle commande'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-4">{error}</p>
      )}

      {showCart && (
        <form onSubmit={handleCreateOrders} className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6 space-y-4">
          <p className="text-sm text-text-muted">
            Renseigne les quantités à commander. Une commande brouillon distincte sera créée par fournisseur.
          </p>
          {Object.entries(productsBySupplier).map(([supplierName, supplierProducts]) => (
            <div key={supplierName}>
              <p className="text-sm font-semibold mb-2">{supplierName}</p>
              <div className="space-y-2">
                {supplierProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-text-muted truncate">{p.name}</span>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder="0"
                      value={quantities[p.id] ?? ''}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-24 min-h-[40px] rounded-card-md border border-border bg-surface px-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                    <span className="text-xs text-text-faint w-14">{UNIT_LABELS[p.unit]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {products.length === 0 && <p className="text-sm text-text-faint">Aucun produit disponible.</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium disabled:opacity-50 hover:brightness-105"
          >
            {isSubmitting ? 'Création…' : 'Créer la/les commande(s)'}
          </button>
        </form>
      )}

      {isLoading && <p className="text-text-faint">Chargement…</p>}

      {!isLoading && orders.length === 0 && (
        <div className="bg-surface border border-border rounded-card-lg shadow-card">
          <EmptyState
            title="Aucune commande pour l'instant"
            description="Passez votre première commande fournisseur à partir des quantités habituelles."
            action={
              <button
                onClick={openCart}
                className="min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105"
              >
                + Nouvelle commande
              </button>
            }
          />
        </div>
      )}

      {orders.length > 0 && (
        <div className="bg-surface border border-border rounded-card-lg shadow-card overflow-hidden">
          <div className={`grid ${TABLE_COLS} gap-3 px-5 pb-2.5 pt-4 text-xs font-semibold uppercase tracking-wide text-text-faint`}>
            <span>Fournisseur</span>
            <span>Date</span>
            <span className="text-right">Lignes</span>
            <span>Statut</span>
          </div>
          {orders.map((order) => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className={`grid ${TABLE_COLS} gap-3 items-center px-5 py-3.5 border-t border-border hover:bg-surface-hover transition-colors`}
            >
              <span className="font-medium truncate">{order.supplier.name}</span>
              <span className="text-sm text-text-muted tabular-nums">
                {new Date(order.createdAt).toLocaleDateString('fr-FR')}
              </span>
              <span className="text-sm text-text tabular-nums text-right">{order.lineItems.length}</span>
              <span>
                <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABELS[order.status]}</Badge>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
