import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import {
  enqueueWasteEntry,
  getQueuedWasteEntries,
  syncQueuedWasteEntries,
  removeFromQueue,
  type QueuedWasteEntry,
} from '../lib/offlineQueue';
import EmptyState from '../components/EmptyState';

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

const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass =
  'min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';
const dangerBtnClass =
  'min-h-[44px] px-3 rounded-card-md border border-danger/40 text-danger text-sm font-medium hover:bg-danger-soft';

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

  // Verrou contre les flush concurrents : deux appels à flushQueue quasi
  // simultanés (le useEffect ci-dessous s'exécute deux fois au montage
  // avec React.StrictMode en dev, et rien ne garantit qu'un futur appelant
  // n'en ajoute pas un second) liraient tous les deux la même file avant
  // que le premier n'ait eu le temps d'en retirer quoi que ce soit (pas
  // d'await synchrone entre la lecture de la file et le premier appel
  // réseau) — chaque déclaration en attente serait alors soumise deux
  // fois. Plutôt que de compter sur "un seul endroit appelle flushQueue",
  // flushQueue se protège elle-même (même principe que refreshPromiseRef
  // dans AuthContext.tsx).
  const isFlushingRef = useRef(false);

  // Rejoue les déclarations en attente dès que la connexion revient (ou
  // au chargement de l'écran, au cas où elle serait déjà revenue sans
  // que l'app ait été rouverte) — le useEffect ci-dessous couvre les deux
  // cas à lui seul (React exécute un effect au moins une fois au montage,
  // peu importe ses dépendances).
  const flushQueue = useCallback(async () => {
    if (isFlushingRef.current) return;
    if (getQueuedWasteEntries().length === 0) return;
    isFlushingRef.current = true;
    try {
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
    } finally {
      isFlushingRef.current = false;
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
      if (!enqueueWasteEntry(payload)) {
        setError("Impossible d'enregistrer la déclaration localement (stockage plein ou indisponible).");
        return;
      }
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
      } else if (enqueueWasteEntry(payload)) {
        // Pas une erreur applicative (validation, droits...) mais un
        // échec réseau (fetch a levé une TypeError) — même repli que
        // le cas hors-ligne détecté en amont.
        setQueuedEntries(getQueuedWasteEntries());
        setSyncNotice('Connexion instable : la déclaration est enregistrée et sera envoyée automatiquement.');
        setSelectedId('');
        setQuantity('');
        setReason('PERIME');
      } else {
        setError("Connexion instable, et impossible d'enregistrer la déclaration localement (stockage plein ou indisponible). Réessayez.");
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

  // Une déclaration en attente peut échouer durablement (le produit
  // qu'elle référence a été supprimé entre-temps) — sans ce bouton,
  // rien ne permettrait à l'utilisateur de l'abandonner lui-même, elle
  // resterait affichée "en attente" indéfiniment.
  function handleDiscardQueued(localId: string) {
    if (!window.confirm('Abandonner cette déclaration en attente ? Elle ne sera jamais envoyée.')) return;
    removeFromQueue(localId);
    setQueuedEntries(getQueuedWasteEntries());
  }

  function queuedEntryLabel(entry: QueuedWasteEntry): string {
    if (entry.productId) return products.find((p) => p.id === entry.productId)?.name ?? 'Produit inconnu';
    return menuItems.find((m) => m.id === entry.menuItemId)?.name ?? 'Plat inconnu';
  }

  return (
    <div className="max-w-3xl">
      <Link to="/menu" className="text-sm text-text-muted hover:text-accent">
        ← Retour à la carte
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-6">Gaspillage et pertes</h2>

      {!isOnline && (
        <p className="text-sm text-warn bg-warn-soft border border-warn/30 rounded-card-md px-3 py-2 mb-4">
          Mode hors-ligne — les déclarations sont enregistrées localement et seront envoyées au retour du réseau.
        </p>
      )}
      {queuedEntries.length > 0 && (
        <div className="bg-surface-hover border border-border rounded-card-md px-3 py-2 mb-4 space-y-2">
          <p className="text-sm text-text-muted">
            {queuedEntries.length} déclaration(s) en attente de synchronisation.
          </p>
          <ul className="space-y-1">
            {queuedEntries.map((entry) => (
              <li key={entry.localId} className="flex items-center justify-between gap-2 text-sm text-text">
                <span className="truncate">
                  {queuedEntryLabel(entry)} · {entry.quantity} · {REASON_LABELS[entry.reason] ?? entry.reason}
                </span>
                <button
                  type="button"
                  onClick={() => handleDiscardQueued(entry.localId)}
                  className="shrink-0 min-h-[32px] px-2 text-xs text-danger hover:underline"
                >
                  Abandonner
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {syncNotice && (
        <p className="text-sm text-good bg-good-soft border border-good/30 rounded-card-md px-3 py-2 mb-4">
          {syncNotice}
        </p>
      )}

      {stats && (
        <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6">
          <p className="text-sm font-medium text-text-muted mb-3">Ce mois-ci</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-4 rounded-card-md bg-surface-hover">
              <p className="text-xs text-text-faint uppercase tracking-wide">Impact sur la marge</p>
              <p className="text-2xl font-bold font-display mt-0.5">{formatEuros(stats.totalValue)} €</p>
            </div>
            <div className="p-4 rounded-card-md bg-surface-hover">
              <p className="text-xs text-text-faint uppercase tracking-wide">Déclarations</p>
              <p className="text-2xl font-bold font-display mt-0.5">{stats.entryCount}</p>
            </div>
          </div>
          {stats.byCategory.length > 0 && (
            <div>
              <p className="text-xs text-text-faint uppercase tracking-wide mb-2">Par catégorie</p>
              <ul className="space-y-1">
                {stats.byCategory.map((c) => (
                  <li key={c.category} className="flex justify-between text-sm">
                    <span className="text-text">{c.category}</span>
                    <span className="text-text-muted tabular-nums">{formatEuros(c.value)} €</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleDeclare} className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6 space-y-3">
        <p className="text-sm font-medium text-text-muted">Déclarer une perte</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setItemType('product');
              setSelectedId('');
            }}
            className={`flex-1 min-h-[40px] rounded-card-md text-sm font-medium border transition-colors ${
              itemType === 'product'
                ? 'bg-accent text-accent-text border-accent'
                : 'bg-surface text-text-muted border-border hover:border-border-strong'
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
            className={`flex-1 min-h-[40px] rounded-card-md text-sm font-medium border transition-colors ${
              itemType === 'menuItem'
                ? 'bg-accent text-accent-text border-accent'
                : 'bg-surface text-text-muted border-border hover:border-border-strong'
            }`}
          >
            Plat fini
          </button>
        </div>

        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={inputClass}>
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
            className={inputClass}
          />
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
            {Object.entries(REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
        )}

        <button type="submit" disabled={isSubmitting} className={`w-full ${primaryBtnClass}`}>
          {isSubmitting ? 'Déclaration…' : 'Déclarer la perte'}
        </button>
      </form>

      {isLoading && <p className="text-text-faint">Chargement…</p>}

      {!isLoading && entries.length === 0 && (
        <div className="bg-surface border border-border rounded-card-lg shadow-card">
          <EmptyState
            title="Aucune perte déclarée"
            description="Les pertes déclarées par l'équipe apparaîtront ici."
          />
        </div>
      )}

      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="bg-surface border border-border rounded-card-lg shadow-card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{entry.product?.name ?? entry.menuItem?.name}</p>
                <p className="text-sm text-text-faint">
                  {Number(entry.quantity)} {entry.product?.unit ?? ''} · {REASON_LABELS[entry.reason]} ·{' '}
                  {new Date(entry.declaredAt).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <p className="text-sm font-medium text-danger whitespace-nowrap tabular-nums">
                  −{formatEuros(Number(entry.estimatedValue))} €
                </p>
                <button onClick={() => handleDelete(entry.id)} aria-label="Supprimer cette déclaration" className={dangerBtnClass}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
