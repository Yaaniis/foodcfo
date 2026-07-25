import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import LegalFooter from '../components/LegalFooter';

export default function OnboardingPage() {
  const { createRestaurant } = useAuth();
  const navigate = useNavigate();

  const [restaurantName, setRestaurantName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createRestaurant({ restaurantName, gerant: { firstName, lastName, email, password } });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de créer le restaurant pour le moment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Créer mon restaurant</h1>
        <p className="text-slate-500 mb-6">Vous deviendrez automatiquement Gérant de ce restaurant.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="restaurantName" className="block text-sm font-medium text-slate-700 mb-1">
              Nom du restaurant
            </label>
            <input
              id="restaurantName"
              required
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 mb-1">
                Prénom
              </label>
              <input
                id="firstName"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 mb-1">
                Nom
              </label>
              <input
                id="lastName"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <p className="text-xs text-slate-400 mt-1">8 caractères minimum</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
          >
            {isSubmitting ? 'Création…' : 'Créer mon restaurant'}
          </button>
        </form>

        <p className="text-sm text-slate-500 mt-6 text-center">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-slate-900 font-medium underline">
            Se connecter
          </Link>
        </p>
      </div>
      <LegalFooter />
      </div>
    </div>
  );
}
