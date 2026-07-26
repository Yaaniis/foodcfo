import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import {
  enqueueWasteEntry,
  getQueuedWasteEntries,
  syncQueuedWasteEntries,
  type QueuedWasteEntry,
} from '../lib/offlineQueue';

interface Product {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  name: string;
}

interface WasteEntry {
  id: string;
  quantity: string;
  estimatedValue: string;
  reason: string;
  declaredAt: string;
  product: { id: string; name: string; unit: string } | null;
  menuItem: { id: string; name: string } | null;
}

interface WasteStats {
  month: string;
  entryCount: number;
  totalValue: number;
  byReason: Record<string, number>;
  byCategory: { category: string; value: number }[];
}

const REASON_LABELS: Record<string, string> = {
  PERIME: 'Périmé',
  ERREUR_PREPARATION: 'Erreur de préparation',
  INVENDU: 'Invendu',
  AUTRE: 'Autre',
};

function formatEuros(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function WastePage() {
  const { authFetch } = useAuth();
  const isOnline = useOnlineStatus();

  const [products, setProducts] = useState<Product[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [entries, setEntries] = useState<WasteEntry[]>([]);
  const [stats, setStats] = useState<WasteStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queuedEntries, setQueuedEntries] = useState<QueuedWasteEntry[]>([]);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const [itemType, setItemType] = useState<'product' | 'menuItem'>('product');
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('PERIME');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rejoue les déclarations en attente dès que la connexion revient (ou
  // au chargement de l'écran, au cas où elle serait déjà revenue sans
  // que l'app ait été rouverte).
  const flushQueue = useCallback(async () => {
    if (getQueuedWasteEntries().length === 0) return;
    const result = await syncQueuedWasteEntries((entry) =>
      authFetch('/api/waste', {
        method: 'POST',
        body: JSON.stringify({
          ...(entry.productId ? { productId: entry.productId } : {}),
          ...(entry.menuItemId ? { menuItemId: entry.menuItemId } : {}),
          quantity: entry.quantity,
          reason: entry.reason,
        }),
      }),
    );
    setQueuedEntries(getQueuedWasteEntries());
    if (result.synced > 0) {
      setSyncNotice(`${result.synced} déclaration(s) hors-ligne synchronisée(s).`);
      await load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetch]);

  // Chaque source est chargée indépendamment (Promise.allSettled, pas
  // Promise.all) : hors-ligne, /api/products et /api/menu-items peuvent
  // répondre depuis le cache Workbox (voir vite.config.ts) pendant que
  // /api/waste et /api/waste/stats échouent faute de réseau — la
  // déclaration doit rester possible même si l'historique ne peut pas
  // se rafraîchir.
  async function load() {
    setIsLoading(true);
    setError(null);
    const [productsRes, menuItemsRes, entriesRes, statsRes] = await Promise.allSettled([
      authFetch<{ products: Product[] }>('/api/products'),
      authFetch<{ menuItems: MenuItem[] }>('/api/menu-items'),
      authFetch<{ wasteEntries: WasteEntry[] }>('/api/waste'),
      authFetch<WasteStats>('/api/waste/stats'),
    ]);
    if (productsRes.status === 'fulfilled') setProducts(productsRes.value.products);
    if (menuItemsRes.status === 'fulfilled') setMenuItems(menuItemsRes.value.menuItems);
    if (entriesRes.status === 'fulfilled') setEntries(entriesRes.value.wasteEntries);
    if (statsRes.status === 'fulfilled') setStats(statsRes.value);

    if (productsRes.status === 'rejected' && menuItemsRes.status === 'rejected') {
      setError('Impossible de charger le gaspillage (hors-ligne, aucune donnée en cache).');
    }
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    setQueuedEntries(getQueuedWasteEntries());
    flushQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOnline) flushQueue();
  }, [isOnline, flushQueue]);

  async function handleDeclare(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSyncNotice(null);
    if (!selectedId || !quantity) {
      setError('Choisis un élément et une quantité.');
      return;
    }

    const payload = {
      ...(itemType === 'product' ? { productId: selectedId } : { menuItemId: selectedId }),
      quantity: Number(quantity),
      reason,
    };

    // Hors-ligne : on ne tente même pas la requête, on met directement
    // en file. En ligne mais la requête échoue quand même pour une
    // raison réseau (pas une erreur métier de l'API) : même repli,
    // plutôt que de faire perdre la saisie à l'utilisateur.
    if (!isOnline) {
      enqueueWasteEntry(payload);
      setQueuedEntries(getQueuedWasteEntries());
      setSyncNotice('Hors-ligne : la déclaration est enregistrée et sera envoyée dès le retour de la connexion.');
      setSelectedId('');
      setQuantity('');
      setReason('PERIME');
      return;
    }

    setIsSubmitting(true);
    try {
      await authFetch('/api/waste', { method: 'POST', body: JSON.stringify(payload) });
      setSelectedId('');
      setQuantity('');
      setReason('PERIME');
      await load();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        // Pas une erreur applicative (validation, droits...) mais un
        // échec réseau (fetch a levé une TypeError) — même repli que
        // le cas hors-ligne détecté en amont.
        enqueueWasteEntry(payload);
        setQueuedEntries(getQueuedWasteEntries());
        setSyncNotice('Connexion instable : la déclaration est enregistrée et sera envoyée automatiquement.');
        setSelectedId('');
        setQuantity('');
        setReason('PERIME');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Supprimer cette déclaration de perte ?')) return;
    try {
      await authFetch(`/api/waste/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de supprimer cette déclaration.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Gaspillage et pertes</h1>

        {!isOnline && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Mode hors-ligne — les déclarations sont enregistrées localement et seront envoyées au retour du réseau.
          </p>
        )}
        {queuedEntries.length > 0 && (
          <p className="text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 mb-4">
            {queuedEntries.length} déclaration(s) en attente de synchronisation.
          </p>
        )}
        {syncNotice && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
            {syncNotice}
          </p>
        )}

        {stats && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <p className="text-sm font-medium text-slate-700 mb-3">Ce mois-ci</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-4 rounded-lg bg-red-50">
                <p className="text-xs text-red-700">Impact sur la marge</p>
                <p className="text-2xl font-bold text-red-700">{formatEuros(stats.totalValue)} €</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-50">
                <p className="text-xs text-slate-500">Déclarations</p>
                <p className="text-2xl font-bold text-slate-900">{stats.entryCount}</p>
              </div>
            </div>
            {stats.byCategory.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Par catégorie</p>
                <ul className="space-y-1">
                  {stats.byCategory.map((c) => (
                    <li key={c.category} className="flex justify-between text-sm">
                      <span className="text-slate-700">{c.category}</span>
                      <span className="text-slate-500">{formatEuros(c.value)} €</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleDeclare} className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-3">
          <p className="text-sm font-medium text-slate-700">Déclarer une perte</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setItemType('product');
                setSelectedId('');
              }}
              className={`flex-1 min-h-[40px] rounded-lg text-sm font-medium border ${
                itemType === 'product' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              Produit brut
            </button>
            <button
              type="button"
              onClick={() => {
                setItemType('menuItem');
                setSelectedId('');
              }}
              className={`flex-1 min-h-[40px] rounded-lg text-sm font-medium border ${
                itemType === 'menuItem' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              Plat fini
            </button>
          </div>

          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
          >
            <option value="">{itemType === 'product' ? 'Choisir un produit…' : 'Choisir un plat…'}</option>
            {(itemType === 'product' ? products : menuItems).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              step="0.0001"
              min="0"
              placeholder="Quantité"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            >
              {Object.entries(REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
          >
            {isSubmitting ? 'Déclaration…' : 'Déclarer la perte'}
          </button>
        </form>

        {isLoading && <p className="text-slate-500">Chargement…</p>}

        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900 truncate">{entry.product?.name ?? entry.menuItem?.name}</p>
                <p className="text-sm text-slate-500">
                  {Number(entry.quantity)} {entry.product?.unit ?? ''} · {REASON_LABELS[entry.reason]} ·{' '}
                  {new Date(entry.declaredAt).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <p className="text-sm font-medium text-red-600 whitespace-nowrap">
                  −{formatEuros(Number(entry.estimatedValue))} €
                </p>
                <button
                  onClick={() => handleDelete(entry.id)}
                  aria-label="Supprimer cette déclaration"
                  className="min-h-[44px] px-3 rounded-lg border border-red-200 text-red-600 text-sm font-medium"
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
          {!isLoading && entries.length === 0 && <p className="text-slate-500">Aucune perte déclarée.</p>}
        </ul>
      </div>
    </div>
  );
}
