import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type RestaurantChoice } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import LegalFooter from '../components/LegalFooter';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Renseigné uniquement pour un compte lié à plusieurs restaurants
  // (voir AuthContext.login) — l'écran bascule alors sur un sélecteur.
  const [restaurantChoices, setRestaurantChoices] = useState<RestaurantChoice[] | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const choices = await login(email, password);
      if (choices) {
        setRestaurantChoices(choices);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de se connecter pour le moment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChooseRestaurant(restaurantId: string) {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password, restaurantId);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de se connecter pour le moment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (restaurantChoices) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">FoodCFO</h1>
            <p className="text-slate-500 mb-6">Ce compte est lié à plusieurs restaurants — lequel ?</p>

            <div className="space-y-2">
              {restaurantChoices.map((r) => (
                <button
                  key={r.restaurantId}
                  onClick={() => handleChooseRestaurant(r.restaurantId)}
                  disabled={isSubmitting}
                  className="w-full min-h-[44px] text-left px-4 rounded-lg border border-slate-300 hover:border-slate-900 disabled:opacity-50"
                >
                  {r.restaurantName}
                </button>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{error}</p>
            )}

            <button
              onClick={() => setRestaurantChoices(null)}
              className="text-sm text-slate-500 underline mt-6"
            >
              ← Retour
            </button>
          </div>
          <LegalFooter />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">FoodCFO</h1>
          <p className="text-slate-500 mb-6">Connectez-vous à votre restaurant</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <p className="text-sm text-slate-500 mt-6 text-center">
            Pas encore de restaurant ?{' '}
            <Link to="/onboarding" className="text-slate-900 font-medium underline">
              Créer un compte
            </Link>
          </p>
        </div>
        <LegalFooter />
      </div>
    </div>
  );
}
