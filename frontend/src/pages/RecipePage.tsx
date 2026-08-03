import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import { computeMarginPreview, MARGIN_STATUS_LABELS, type MarginStatus } from '../lib/margin';
import { ALLERGENS, ALLERGEN_LABELS } from '../lib/allergens';
import EmptyState from '../components/EmptyState';

interface Product {
  id: string;
  name: string;
  unit: string;
  currentPriceHT: string;
}

interface RecipeIngredientRow {
  productId: string;
  quantity: string;
}

interface MenuItemDetail {
  id: string;
  name: string;
  category: string;
  sellingPriceTTC: string;
  vatRate: string;
  allergens: string[];
  recipe: { ingredients: { productId: string; quantity: string; product: Product }[] } | null;
}

interface RestaurantThresholds {
  marginGreenThreshold: string;
  marginOrangeThreshold: string;
}

const UNIT_LABELS: Record<string, string> = {
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'mL',
  UNITE: 'unité',
};

const VAT_OPTIONS: { value: string; label: string }[] = [
  { value: 'TAUX_5_5', label: 'TVA 5,5 % (à emporter)' },
  { value: 'TAUX_10', label: 'TVA 10 % (sur place)' },
  { value: 'TAUX_20', label: 'TVA 20 % (alcool)' },
];

// Panneau plus grand qu'un badge (le composant Badge sert aux pastilles
// courtes) — mêmes tons sémantiques que partout ailleurs, appliqués à
// un bloc entier plutôt qu'à une pastille.
const MARGIN_PANEL_TONE: Record<MarginStatus, string> = {
  GREEN: 'bg-good-soft border-good/30 text-good',
  ORANGE: 'bg-warn-soft border-warn/30 text-warn',
  RED: 'bg-danger-soft border-danger/30 text-danger',
};

export default function RecipePage() {
  const { menuItemId } = useParams<{ menuItemId: string }>();
  const navigate = useNavigate();
  const { authFetch, user } = useAuth();
  const canEditPricing = user?.role === 'GERANT';

  const [menuItem, setMenuItem] = useState<MenuItemDetail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [thresholds, setThresholds] = useState<{ greenThreshold: number; orangeThreshold: number }>({
    greenThreshold: 70,
    orangeThreshold: 60,
  });
  const [rows, setRows] = useState<RecipeIngredientRow[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [vatRate, setVatRate] = useState('TAUX_10');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [itemData, productsData, restaurantData] = await Promise.all([
        authFetch<{ menuItem: MenuItemDetail }>(`/api/menu-items/${menuItemId}`),
        authFetch<{ products: Product[] }>('/api/products'),
        authFetch<{ restaurant: RestaurantThresholds }>('/api/restaurants/me'),
      ]);
      setMenuItem(itemData.menuItem);
      setProducts(productsData.products);
      setThresholds({
        greenThreshold: Number(restaurantData.restaurant.marginGreenThreshold),
        orangeThreshold: Number(restaurantData.restaurant.marginOrangeThreshold),
      });
      setName(itemData.menuItem.name);
      setCategory(itemData.menuItem.category);
      setPrice(String(itemData.menuItem.sellingPriceTTC));
      setVatRate(itemData.menuItem.vatRate);
      setAllergens(itemData.menuItem.allergens);
      const existingRows =
        itemData.menuItem.recipe?.ingredients.map((i) => ({
          productId: i.productId,
          quantity: String(i.quantity),
        })) ?? [];
      setRows(existingRows.length > 0 ? existingRows : [{ productId: '', quantity: '' }]);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger la fiche technique.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItemId]);

  function updateRow(index: number, field: keyof RecipeIngredientRow, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { productId: '', quantity: '' }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleAllergen(a: string) {
    setAllergens((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  // Recalcul en direct à chaque changement d'ingrédient/quantité/prix —
  // pas d'appel réseau, la formule est dupliquée côté client
  // (voir frontend/src/lib/margin.ts) pour un retour instantané.
  const preview = useMemo(() => {
    if (!menuItem) return null;
    const ingredients = rows
      .filter((r) => r.productId && r.quantity)
      .map((r) => {
        const product = products.find((p) => p.id === r.productId);
        return { quantity: Number(r.quantity), unitPriceHT: product ? Number(product.currentPriceHT) : 0 };
      });
    if (ingredients.length === 0 || !price) return null;
    return computeMarginPreview(Number(price), vatRate, ingredients, thresholds);
  }, [rows, products, price, vatRate, menuItem, thresholds]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const ingredients = rows
        .filter((r) => r.productId && r.quantity)
        .map((r) => ({ productId: r.productId, quantity: Number(r.quantity) }));

      await authFetch(`/api/menu-items/${menuItemId}/recipe`, {
        method: 'PUT',
        body: JSON.stringify({ ingredients }),
      });

      if (menuItem) {
        const nameChanged = name !== menuItem.name;
        const categoryChanged = category !== menuItem.category;
        const priceChanged = Number(price) !== Number(menuItem.sellingPriceTTC);
        const vatChanged = vatRate !== menuItem.vatRate;
        const allergensChanged = JSON.stringify([...allergens].sort()) !== JSON.stringify([...menuItem.allergens].sort());
        if (nameChanged || categoryChanged || priceChanged || vatChanged || allergensChanged) {
          await authFetch(`/api/menu-items/${menuItemId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              ...(nameChanged ? { name } : {}),
              ...(categoryChanged ? { category } : {}),
              ...(priceChanged ? { sellingPriceTTC: Number(price) } : {}),
              ...(vatChanged ? { vatRate } : {}),
              ...(allergensChanged ? { allergens } : {}),
            }),
          });
        }
      }

      navigate('/menu');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'enregistrer la fiche technique.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-text-faint">Chargement…</p>;
  }

  const inputClass =
    'mt-1 w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-surface-hover disabled:text-text-faint disabled:cursor-not-allowed';

  return (
    <div className="max-w-3xl">
      <Link to="/menu" className="text-sm text-text-muted hover:text-accent">
        ← Retour à la carte
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-1">Fiche technique</h2>
      <p className="text-text-muted mb-6">{menuItem?.name}</p>

      {products.length === 0 ? (
        <div className="bg-surface border border-border rounded-card-lg shadow-card">
          <EmptyState
            title="Aucun produit disponible"
            description="Ajoutez des produits auprès de vos fournisseurs pour pouvoir composer une fiche technique."
            action={
              <Link
                to="/suppliers"
                className="min-h-[44px] px-4 inline-flex items-center rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105"
              >
                Créer des produits →
              </Link>
            }
          />
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-surface border border-border rounded-card-lg shadow-card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-text-muted">
              Nom du plat
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className="block text-sm font-medium text-text-muted">
              Catégorie
              <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-text-muted">
              Prix de vente TTC (€)
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={!canEditPricing}
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-text-muted">
              TVA
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                disabled={!canEditPricing}
                className={inputClass}
              >
                {VAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!canEditPricing && (
            <p className="text-xs text-text-faint -mt-2">Seul un Gérant peut modifier le prix de vente ou la TVA.</p>
          )}

          <div>
            <p className="text-sm font-medium text-text-muted mb-2">Allergènes présents</p>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => toggleAllergen(a)}
                  className={`min-h-[44px] px-3 rounded-card-md text-sm border transition-colors ${
                    allergens.includes(a)
                      ? 'bg-accent text-accent-text border-accent'
                      : 'bg-surface text-text-muted border-border hover:border-border-strong'
                  }`}
                >
                  {ALLERGEN_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          {rows.map((row, index) => (
            <div key={index} className="flex gap-2 items-center">
              <select
                value={row.productId}
                onChange={(e) => updateRow(index, 'productId', e.target.value)}
                className="flex-1 min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              >
                <option value="">Choisir un ingrédient…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="Qté"
                value={row.quantity}
                onChange={(e) => updateRow(index, 'quantity', e.target.value)}
                className="w-24 min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
              <span className="text-sm text-text-faint w-10">
                {row.productId ? UNIT_LABELS[products.find((p) => p.id === row.productId)?.unit ?? ''] : ''}
              </span>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="min-h-[44px] px-3 text-danger hover:brightness-110"
              >
                ✕
              </button>
            </div>
          ))}

          <button type="button" onClick={addRow} className="text-sm text-accent font-medium hover:underline">
            + Ajouter un ingrédient
          </button>

          {preview && (
            <div className={`rounded-card-md border p-4 ${MARGIN_PANEL_TONE[preview.status]}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium">{MARGIN_STATUS_LABELS[preview.status]}</p>
                <p className="text-sm font-semibold">{preview.marginRatio.toFixed(1)} % de marge</p>
              </div>
              <div className="text-sm grid grid-cols-2 gap-1 text-text">
                <span>Coût matière HT</span>
                <span className="text-right">{preview.costHT.toFixed(2)} €</span>
                <span>Marge</span>
                <span className="text-right">{preview.marginEuros.toFixed(2)} €</span>
                <span title="Prix de vente TTC ÷ coût matière HT — indique combien de fois le prix de vente couvre le coût des ingrédients.">
                  Coefficient multiplicateur ⓘ
                </span>
                <span className="text-right">{preview.coefficient !== null ? `×${preview.coefficient.toFixed(2)}` : '—'}</span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium disabled:opacity-50 hover:brightness-105"
          >
            {isSaving ? 'Enregistrement…' : 'Enregistrer la fiche technique'}
          </button>
        </form>
      )}
    </div>
  );
}
