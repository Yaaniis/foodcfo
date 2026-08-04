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

const inputClass =
  'mt-1 w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass =
  'w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';

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
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-text-muted hover:text-accent">
        ← Retour à l'accueil
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-6">Paramètres du restaurant</h2>

      {isLoading ? (
        <p className="text-text-faint">Chargement…</p>
      ) : (
        <div className="bg-surface border border-border rounded-card-lg shadow-card p-6">
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm font-medium text-text-muted">
              Nom du restaurant
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>

            <label className="block text-sm font-medium text-text-muted">
              Fuseau horaire
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
                {/* Garde l'actuel dans la liste même s'il est hors de la sélection courante */}
                {!COMMON_TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-text-faint mt-1">
                Utilisé pour calculer "ce mois-ci" (tableau de bord, rapports, export comptable) à l'heure locale du
                restaurant.
              </span>
            </label>

            {message && (
              <p className="text-sm text-good bg-good-soft border border-good/30 rounded-card-md px-3 py-2">{message}</p>
            )}
            {error && (
              <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={isSubmitting} className={primaryBtnClass}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
