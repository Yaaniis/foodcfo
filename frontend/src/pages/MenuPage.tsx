import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import { MARGIN_STATUS_LABELS, type MarginPreview, type MarginStatus } from '../lib/margin';
import { ALLERGENS, ALLERGEN_LABELS } from '../lib/allergens';
import Badge, { type BadgeTone } from '../components/Badge';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  sellingPriceTTC: string;
  vatRate: string;
  isActive: boolean;
  allergens: string[];
  recipe: { ingredients: unknown[] } | null;
  margin: MarginPreview | null;
}

const VAT_LABELS: Record<string, string> = {
  TAUX_5_5: '5,5 %',
  TAUX_10: '10 %',
  TAUX_20: '20 %',
};

const MARGIN_STATUS_TONE: Record<MarginStatus, BadgeTone> = {
  GREEN: 'success',
  ORANGE: 'attention',
  RED: 'danger',
};

export default function MenuPage() {
  const { authFetch, user } = useAuth();
  // Service consulte la carte et les allergènes en lecture seule
  // (décision 0.5) — jamais la marge (donnée financière interne) ni les
  // actions d'édition, réservées à Gérant/Cuisine.
  const canManage = user?.role === 'GERANT' || user?.role === 'CUISINE';

  const [items, setItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [vatRate, setVatRate] = useState('TAUX_10');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadItems() {
    setIsLoading(true);
    try {
      const data = await authFetch<{ menuItems: MenuItem[] }>('/api/menu-items');
      setItems(data.menuItems);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger la carte.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleAllergen(a: string) {
    setAllergens((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await authFetch('/api/menu-items', {
        method: 'POST',
        body: JSON.stringify({ name, category, sellingPriceTTC: Number(price), vatRate, allergens }),
      });
      setName('');
      setCategory('');
      setPrice('');
      setVatRate('TAUX_10');
      setAllergens([]);
      setShowForm(false);
      await loadItems();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Impossible de créer ce plat.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleActive(item: MenuItem) {
    try {
      await authFetch(`/api/menu-items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      await loadItems();
    } catch {
      setError('Impossible de modifier ce plat.');
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">La carte</h2>
        {canManage && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            {showForm ? 'Annuler' : '+ Ajouter un plat'}
          </button>
        )}
      </div>
      {canManage && (
        <Link to="/suppliers" className="text-sm text-text-muted hover:text-accent">
          Gérer les fournisseurs et produits →
        </Link>
      )}

      {showForm && canManage && (
        <form
          onSubmit={handleCreate}
          className="bg-surface border border-border rounded-card-lg shadow-card p-6 my-6 space-y-4"
        >
          <input
            placeholder="Nom du plat"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          <input
            placeholder="Catégorie (ex: Plats, Desserts)"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Prix de vente TTC (€)"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
            <select
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              className="min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            >
              <option value="TAUX_5_5">TVA 5,5 % (à emporter)</option>
              <option value="TAUX_10">TVA 10 % (sur place)</option>
              <option value="TAUX_20">TVA 20 % (alcool)</option>
            </select>
          </div>

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

          {formError && (
            <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium disabled:opacity-50 hover:brightness-105"
          >
            {isSubmitting ? 'Création…' : 'Créer ce plat'}
          </button>
        </form>
      )}

      {isLoading && <p className="text-text-faint mt-6">Chargement…</p>}
      {error && <p className="text-danger mt-6">{error}</p>}

      <div className="bg-surface border border-border rounded-card-lg shadow-card mt-6 px-4">
        {items.map((item) => (
          <div key={item.id} className="py-4 border-t border-border first:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                <p className="text-sm text-text-faint">
                  {item.category} · {Number(item.sellingPriceTTC).toFixed(2)} € TTC · TVA{' '}
                  {VAT_LABELS[item.vatRate]}
                </p>
                {item.allergens.length > 0 && (
                  <p className="text-xs text-text-faint mt-1">
                    Allergènes : {item.allergens.map((a) => ALLERGEN_LABELS[a]).join(', ')}
                  </p>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                {canManage ? (
                  <button
                    onClick={() => toggleActive(item)}
                    className={`min-h-[44px] px-3 rounded-card-md text-sm font-medium transition-colors ${
                      item.isActive ? 'bg-surface-hover text-text-muted hover:text-text' : 'bg-danger-soft text-danger'
                    }`}
                  >
                    {item.isActive ? 'Actif' : 'Inactif'}
                  </button>
                ) : (
                  <Badge tone={item.isActive ? 'neutral' : 'danger'}>{item.isActive ? 'Actif' : 'Inactif'}</Badge>
                )}
                {canManage && item.margin && (
                  <Badge tone={MARGIN_STATUS_TONE[item.margin.status]}>
                    {MARGIN_STATUS_LABELS[item.margin.status]} · {item.margin.marginRatio.toFixed(0)} %
                  </Badge>
                )}
              </div>
            </div>
            {canManage && (
              <Link to={`/menu/${item.id}/recipe`} className="inline-block mt-3 text-sm text-accent font-medium hover:underline">
                {item.recipe ? 'Modifier la fiche technique →' : 'Créer la fiche technique →'}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
