import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  sellingPriceTTC: string;
  vatRate: string;
  isActive: boolean;
  allergens: string[];
  recipe: { ingredients: unknown[] } | null;
}

const VAT_LABELS: Record<string, string> = {
  TAUX_5_5: '5,5 %',
  TAUX_10: '10 %',
  TAUX_20: '20 %',
};

const ALLERGENS = [
  'GLUTEN',
  'CRUSTACES',
  'OEUFS',
  'POISSON',
  'ARACHIDES',
  'SOJA',
  'LAIT',
  'FRUITS_A_COQUE',
  'CELERI',
  'MOUTARDE',
  'SESAME',
  'SULFITES',
  'LUPIN',
  'MOLLUSQUES',
] as const;

const ALLERGEN_LABELS: Record<string, string> = {
  GLUTEN: 'Gluten',
  CRUSTACES: 'Crustacés',
  OEUFS: 'Œufs',
  POISSON: 'Poisson',
  ARACHIDES: 'Arachides',
  SOJA: 'Soja',
  LAIT: 'Lait',
  FRUITS_A_COQUE: 'Fruits à coque',
  CELERI: 'Céleri',
  MOUTARDE: 'Moutarde',
  SESAME: 'Sésame',
  SULFITES: 'Sulfites',
  LUPIN: 'Lupin',
  MOLLUSQUES: 'Mollusques',
};

export default function MenuPage() {
  const { authFetch } = useAuth();

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
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>

        <div className="flex items-center justify-between mt-2 mb-2">
          <h1 className="text-2xl font-bold text-slate-900">La carte</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium"
          >
            {showForm ? 'Annuler' : '+ Ajouter un plat'}
          </button>
        </div>
        <Link to="/suppliers" className="text-sm text-slate-500 underline">
          Gérer les fournisseurs et produits →
        </Link>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-slate-200 p-6 my-6 space-y-4">
            <input
              placeholder="Nom du plat"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
            <input
              placeholder="Catégorie (ex: Plats, Desserts)"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
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
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              >
                <option value="TAUX_5_5">TVA 5,5 % (à emporter)</option>
                <option value="TAUX_10">TVA 10 % (sur place)</option>
                <option value="TAUX_20">TVA 20 % (alcool)</option>
              </select>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Allergènes présents</p>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => toggleAllergen(a)}
                    className={`min-h-[44px] px-3 rounded-lg text-sm border ${
                      allergens.includes(a)
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {ALLERGEN_LABELS[a]}
                  </button>
                ))}
              </div>
            </div>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Création…' : 'Créer ce plat'}
            </button>
          </form>
        )}

        {isLoading && <p className="text-slate-500 mt-6">Chargement…</p>}
        {error && <p className="text-red-600 mt-6">{error}</p>}

        <ul className="space-y-2 mt-6">
          {items.map((item) => (
            <li key={item.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{item.name}</p>
                  <p className="text-sm text-slate-500">
                    {item.category} · {Number(item.sellingPriceTTC).toFixed(2)} € TTC · TVA{' '}
                    {VAT_LABELS[item.vatRate]}
                  </p>
                  {item.allergens.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      Allergènes : {item.allergens.map((a) => ALLERGEN_LABELS[a]).join(', ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => toggleActive(item)}
                  className={`shrink-0 min-h-[44px] px-3 rounded-lg text-sm font-medium ${
                    item.isActive ? 'bg-slate-100 text-slate-700' : 'bg-red-50 text-red-600'
                  }`}
                >
                  {item.isActive ? 'Actif' : 'Inactif'}
                </button>
              </div>
              <Link
                to={`/menu/${item.id}/recipe`}
                className="inline-block mt-3 text-sm text-slate-900 underline font-medium"
              >
                {item.recipe ? 'Modifier la fiche technique →' : 'Créer la fiche technique →'}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
