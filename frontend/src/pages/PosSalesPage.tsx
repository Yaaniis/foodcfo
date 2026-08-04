import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import { posProviderLabel } from '../lib/posProviders';

interface MenuItemOption {
  id: string;
  name: string;
}

interface PosSaleLineItem {
  id: string;
  menuItemId: string | null;
  menuItem: MenuItemOption | null;
  rawLabel: string;
  quantity: string;
  unitPriceTTC: string;
  totalPriceTTC: string;
  wasManuallyEdited: boolean;
}

interface PosSale {
  id: string;
  externalId: string;
  soldAt: string;
  totalAmount: string;
  needsReview: boolean;
  posConnection: { id: string; provider: string };
  lineItems: PosSaleLineItem[];
}

const selectClass =
  'flex-1 min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const numberInputClass =
  'w-24 min-h-[44px] rounded-card-md border border-border bg-surface px-2 text-sm text-text tabular-nums text-right focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';

export default function PosSalesPage() {
  const { user, authFetch } = useAuth();

  const [sales, setSales] = useState<PosSale[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [salesData, menuItemsData] = await Promise.all([
        authFetch<{ sales: PosSale[] }>('/api/pos/sales'),
        authFetch<{ menuItems: MenuItemOption[] }>('/api/menu-items'),
      ]);
      setSales(salesData.sales);
      setMenuItems(menuItemsData.menuItems);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger les ventes.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMenuItemChange(sale: PosSale, line: PosSaleLineItem, menuItemId: string) {
    try {
      await authFetch(`/api/pos/sales/${sale.id}/line-items/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ menuItemId: menuItemId || null }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de mettre à jour cette ligne.');
    }
  }

  // Sauvegarde au blur (pas à chaque frappe) — mêmes principes que le
  // reste de l'app (ex. saisie de seuils sur DashboardPage). totalPriceTTC
  // recalculé plutôt que redemandé séparément, même logique que
  // handleAddLine sur InvoiceReviewPage.tsx.
  async function handleAmountBlur(sale: PosSale, line: PosSaleLineItem, field: 'quantity' | 'unitPriceTTC', rawValue: string) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) return;
    const quantity = field === 'quantity' ? value : Number(line.quantity);
    const unitPriceTTC = field === 'unitPriceTTC' ? value : Number(line.unitPriceTTC);
    if (quantity === Number(line.quantity) && unitPriceTTC === Number(line.unitPriceTTC)) return;

    try {
      await authFetch(`/api/pos/sales/${sale.id}/line-items/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity, unitPriceTTC, totalPriceTTC: quantity * unitPriceTTC }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de mettre à jour cette ligne.');
    }
  }

  if (isLoading) {
    return <p className="text-text-faint">Chargement…</p>;
  }

  return (
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-text-muted hover:text-accent">
        ← Retour à l'accueil
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-1">Ventes à rapprocher</h2>
      <p className="text-sm text-text-muted mb-6">
        Chaque vente remontée par la caisse est automatiquement rapprochée d'un plat de la carte. Corrigez si besoin —
        rien d'autre à faire quand le rapprochement est bon.
      </p>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-4">{error}</p>
      )}

      {sales.length === 0 ? (
        <EmptyState
          title="Aucune vente pour l'instant"
          description="Les ventes remontées par la caisse apparaîtront ici, prêtes à être vérifiées."
          action={
            user?.role === 'GERANT' ? (
              <Link to="/pos" className="text-sm text-accent hover:underline">
                Gérer la connexion caisse →
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {sales.map((sale) => (
            <div key={sale.id} className="bg-surface border border-border rounded-card-lg shadow-card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm text-text-muted">
                    {new Date(sale.soldAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                    {posProviderLabel(sale.posConnection.provider)}
                  </p>
                  <p className="font-display text-lg font-bold tabular-nums">{Number(sale.totalAmount).toFixed(2)} €</p>
                </div>
                <Badge tone={sale.needsReview ? 'attention' : 'success'}>{sale.needsReview ? 'À vérifier' : 'Rapproché'}</Badge>
              </div>

              <div className="space-y-2">
                {sale.lineItems.map((line) => (
                  <div key={line.id} className="border border-border rounded-card-md p-3">
                    <p className="text-sm text-text-faint mb-2">{line.rawLabel}</p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <select
                        value={line.menuItemId ?? ''}
                        onChange={(e) => handleMenuItemChange(sale, line, e.target.value)}
                        className={selectClass}
                      >
                        <option value="">Non rapproché — choisir un plat…</option>
                        {menuItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <input
                        key={`qty-${line.id}-${line.quantity}`}
                        type="number"
                        step="0.0001"
                        min="0"
                        defaultValue={line.quantity}
                        onBlur={(e) => handleAmountBlur(sale, line, 'quantity', e.target.value)}
                        aria-label="Quantité"
                        className={numberInputClass}
                      />
                      <span className="text-text-faint text-sm">×</span>
                      <input
                        key={`price-${line.id}-${line.unitPriceTTC}`}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={line.unitPriceTTC}
                        onBlur={(e) => handleAmountBlur(sale, line, 'unitPriceTTC', e.target.value)}
                        aria-label="Prix unitaire TTC"
                        className={numberInputClass}
                      />
                      <span className="text-text-muted text-sm">€</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
