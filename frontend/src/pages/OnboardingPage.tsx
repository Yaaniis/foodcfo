import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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

export default function OnboardingPage() {
  const { createRestaurant } = useAuth();
  const navigate = useNavigate();

  const [restaurantName, setRestaurantName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!acceptTerms) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await createRestaurant({ restaurantName, gerant: { firstName, lastName, email, password }, acceptTerms: true });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de créer le restaurant pour le moment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg bg-app-gradient px-4 py-8">
      <div className="w-full max-w-[380px]">
        <div className={`bg-surface border border-border rounded-card-lg ${cardShadow} p-6 flex flex-col gap-5`}>
          <div className="flex flex-col items-center gap-3 text-center">
            <AuthBrandMark />
            <div>
              <h2 className="font-display text-lg font-bold">Créer mon restaurant</h2>
              <p className="text-sm text-text-muted mt-1">Vous deviendrez automatiquement Gérant de ce restaurant.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="restaurantName" className={labelClass}>
                Nom du restaurant
              </label>
              <input
                id="restaurantName"
                required
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="firstName" className={labelClass}>
                  Prénom
                </label>
                <input
                  id="firstName"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="lastName" className={labelClass}>
                  Nom
                </label>
                <input
                  id="lastName"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

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
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-text-faint">8 caractères minimum</p>
            </div>

            <label className="flex items-start gap-2 min-h-[44px]">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-accent"
              />
              <span className="text-sm text-text-muted">
                J'accepte les{' '}
                <Link to="/cgu" target="_blank" className="text-accent hover:underline">
                  CGU
                </Link>{' '}
                et la{' '}
                <Link to="/confidentialite" target="_blank" className="text-accent hover:underline">
                  politique de confidentialité
                </Link>
                .
              </span>
            </label>

            {error && (
              <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={isSubmitting || !acceptTerms} className={primaryBtnClass}>
              {isSubmitting ? 'Création…' : 'Créer mon restaurant'}
            </button>
          </form>

          <p className="text-sm text-text-muted text-center">
            Déjà un compte ?{' '}
            <Link to="/login" className="text-accent font-semibold hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
        <LegalFooter />
      </div>
    </div>
  );
}
