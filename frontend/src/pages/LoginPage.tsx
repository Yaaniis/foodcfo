import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type RestaurantChoice } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import LegalFooter from '../components/LegalFooter';
import AuthBrandMark from '../components/AuthBrandMark';

const cardShadow =
  'shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(232,234,242,0.09),0_0_40px_-12px_rgba(255,159,74,0.25)]';
const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass =
  'w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';
const labelClass = 'text-xs text-text-faint uppercase tracking-wide font-semibold';

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
      <div className="min-h-screen flex items-center justify-center bg-bg bg-app-gradient px-4">
        <div className="w-full max-w-[380px]">
          <div className={`bg-surface border border-border rounded-card-lg ${cardShadow} p-6 flex flex-col gap-5`}>
            <div className="flex flex-col items-center gap-3 text-center">
              <AuthBrandMark />
              <p className="text-sm text-text-muted">Ce compte est lié à plusieurs restaurants — lequel ?</p>
            </div>

            <div className="flex flex-col gap-2">
              {restaurantChoices.map((r) => (
                <button
                  key={r.restaurantId}
                  onClick={() => handleChooseRestaurant(r.restaurantId)}
                  disabled={isSubmitting}
                  className="w-full min-h-[44px] text-left px-4 rounded-card-md border border-border hover:border-border-strong transition-colors disabled:opacity-50"
                >
                  {r.restaurantName}
                </button>
              ))}
            </div>

            {error && (
              <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
            )}

            <button
              onClick={() => setRestaurantChoices(null)}
              className="text-sm text-text-muted hover:text-accent text-left"
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
    <div className="min-h-screen flex items-center justify-center bg-bg bg-app-gradient px-4">
      <div className="w-full max-w-[380px]">
        <div className={`bg-surface border border-border rounded-card-lg ${cardShadow} p-6 flex flex-col gap-5`}>
          <div className="flex flex-col items-center gap-3 text-center">
            <AuthBrandMark />
            <p className="text-sm text-text-muted">Connectez-vous à votre restaurant</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className={labelClass}>
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              <div className="flex justify-end -mt-1">
                <Link to="/forgot-password" className="text-xs text-text-muted hover:text-accent">
                  Mot de passe oublié ?
                </Link>
              </div>
            </div>

            {error && (
              <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={isSubmitting} className={primaryBtnClass}>
              {isSubmitting ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <p className="text-sm text-text-muted text-center">
            Pas encore de restaurant ?{' '}
            <Link to="/onboarding" className="text-accent font-semibold hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>
        <LegalFooter />
      </div>
    </div>
  );
}
