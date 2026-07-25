import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, type LinkedRestaurant } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

// Sélecteur de restaurant actif (multi-restaurant, décision 0.1) —
// affiché uniquement quand le compte connecté est réellement lié à
// plusieurs restaurants, pour ne rien changer visuellement à
// l'expérience à un seul restaurant (cas le plus courant).
export default function RestaurantSwitcher() {
  const { user, authFetch, switchRestaurant, addRestaurant } = useAuth();

  const [restaurants, setRestaurants] = useState<LinkedRestaurant[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await authFetch<{ restaurants: LinkedRestaurant[] }>('/api/restaurants/mine');
      setRestaurants(data.restaurants);
    } catch {
      // Silencieux : ce composant est un simple confort de navigation,
      // pas une donnée critique de l'écran qui l'affiche.
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSwitch(restaurantId: string) {
    if (restaurants.find((r) => r.id === restaurantId)?.isCurrent) return;
    setIsSwitching(true);
    try {
      await switchRestaurant(restaurantId);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de changer de restaurant.');
      setIsSwitching(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsAdding(true);
    try {
      await addRestaurant(newName);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Impossible d'ajouter ce restaurant.");
      setIsAdding(false);
    }
  }

  if (restaurants.length === 0) return null;

  return (
    <div className="mb-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{error}</p>
      )}

      {restaurants.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={restaurants.find((r) => r.isCurrent)?.id ?? ''}
            onChange={(e) => handleSwitch(e.target.value)}
            disabled={isSwitching}
            className="min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm"
          >
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {user?.role === 'GERANT' && (
            <Link to="/consolidated" className="text-sm text-slate-500 underline">
              Vue consolidée →
            </Link>
          )}
        </div>
      )}

      {user?.role === 'GERANT' && (
        <div className="mt-2">
          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)} className="text-sm text-slate-500 underline">
              + Ajouter un restaurant
            </button>
          ) : (
            <form onSubmit={handleAdd} className="flex items-center gap-2 mt-1">
              <input
                placeholder="Nom du nouveau restaurant"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm flex-1"
              />
              <button
                type="submit"
                disabled={isAdding}
                className="min-h-[40px] px-3 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
              >
                {isAdding ? 'Création…' : 'Créer'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
