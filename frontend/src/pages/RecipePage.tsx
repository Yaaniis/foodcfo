import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

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
  recipe: { ingredients: { productId: string; quantity: string; product: Product }[] } | null;
}

const UNIT_LABELS: Record<string, string> = {
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'mL',
  UNITE: 'unité',
};

export default function RecipePage() {
  const { menuItemId } = useParams<{ menuItemId: string }>();
  const navigate = useNavigate();
  const { authFetch } = useAuth();

  const [menuItem, setMenuItem] = useState<MenuItemDetail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<RecipeIngredientRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [itemData, productsData] = await Promise.all([
        authFetch<{ menuItem: MenuItemDetail }>(`/api/menu-items/${menuItemId}`),
        authFetch<{ products: Product[] }>('/api/products'),
      ]);
      setMenuItem(itemData.menuItem);
      setProducts(productsData.products);
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
      navigate('/menu');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'enregistrer la fiche technique.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/menu" className="text-sm text-slate-500 underline">
          ← Retour à la carte
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-1">Fiche technique</h1>
        <p className="text-slate-500 mb-6">{menuItem?.name}</p>

        {products.length === 0 ? (
          <p className="text-slate-500">
            Aucun produit disponible.{' '}
            <Link to="/suppliers" className="underline font-medium">
              Créer des produits →
            </Link>
          </p>
        ) : (
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            {rows.map((row, index) => (
              <div key={index} className="flex gap-2 items-center">
                <select
                  value={row.productId}
                  onChange={(e) => updateRow(index, 'productId', e.target.value)}
                  className="flex-1 min-h-[44px] rounded-lg border border-slate-300 px-3"
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
                  className="w-24 min-h-[44px] rounded-lg border border-slate-300 px-3"
                />
                <span className="text-sm text-slate-400 w-10">
                  {row.productId ? UNIT_LABELS[products.find((p) => p.id === row.productId)?.unit ?? ''] : ''}
                </span>
                <button type="button" onClick={() => removeRow(index)} className="min-h-[44px] px-3 text-red-600">
                  ✕
                </button>
              </div>
            ))}

            <button type="button" onClick={addRow} className="text-sm text-slate-900 underline font-medium">
              + Ajouter un ingrédient
            </button>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
            >
              {isSaving ? 'Enregistrement…' : 'Enregistrer la fiche technique'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
