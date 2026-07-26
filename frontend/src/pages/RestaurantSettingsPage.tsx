import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface RestaurantInfo {
  id: string;
  name: string;
  timezone: string;
}

// Liste courte plutôt qu'exhaustive (~400 identifiants IANA) : un
// simple champ texte validé côté serveur suffirait, mais un menu
// déroulant limité aux fuseaux plausibles pour un restaurant évite la
// faute de frappe sur un identifiant qui doit être exact.
const COMMON_TIMEZONES = [
  'Europe/Paris',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'America/Guadeloupe',
  'America/Martinique',
  'Indian/Reunion',
  'Pacific/Noumea',
  'UTC',
];

export default function RestaurantSettingsPage() {
  const { authFetch } = useAuth();

  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Europe/Paris');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await authFetch<{ restaurant: RestaurantInfo }>('/api/restaurants/me');
      setRestaurant(data.restaurant);
      setName(data.restaurant.name);
      setTimezone(data.restaurant.timezone);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger les informations.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const data = await authFetch<{ restaurant: RestaurantInfo }>('/api/restaurants/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, timezone }),
      });
      setRestaurant(data.restaurant);
      setMessage('Informations mises à jour.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de mettre à jour les informations.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Paramètres du restaurant</h1>

        {isLoading ? (
          <p className="text-slate-500">Chargement…</p>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Nom du restaurant
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Fuseau horaire
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                >
                  {/* Garde l'actuel dans la liste même s'il est hors de la sélection courante */}
                  {!COMMON_TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <span className="block text-xs text-slate-400 mt-1">
                  Utilisé pour calculer "ce mois-ci" (tableau de bord, rapports, export comptable) à l'heure locale du
                  restaurant.
                </span>
              </label>

              {message && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  {message}
                </p>
              )}
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
              >
                {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
