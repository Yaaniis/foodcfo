import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, ApiRequestError } from '../lib/apiClient';
import LegalFooter from '../components/LegalFooter';
import AuthBrandMark from '../components/AuthBrandMark';

const cardShadow =
  'shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(232,234,242,0.09),0_0_40px_-12px_rgba(255,159,74,0.25)]';
const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass =
  'w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';
const labelClass = 'text-xs text-text-faint uppercase tracking-wide font-semibold';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de traiter la demande pour le moment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg bg-app-gradient px-4">
      <div className="w-full max-w-[380px]">
        <div className={`bg-surface border border-border rounded-card-lg ${cardShadow} p-6 flex flex-col gap-5`}>
          <div className="flex flex-col items-center gap-3 text-center">
            <AuthBrandMark />
            <div>
              <h2 className="font-display text-lg font-bold">Mot de passe oublié</h2>
              <p className="text-sm text-text-muted mt-1">
                Indique ton email, on t'envoie un lien pour choisir un nouveau mot de passe.
              </p>
            </div>
          </div>

          {message ? (
            <p className="text-sm text-good bg-good-soft border border-good/30 rounded-card-md px-3 py-2">{message}</p>
          ) : (
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

              {error && (
                <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={isSubmitting} className={primaryBtnClass}>
                {isSubmitting ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
              </button>
            </form>
          )}

          <p className="text-sm text-text-muted text-center">
            <Link to="/login" className="text-accent font-semibold hover:underline">
              ← Retour à la connexion
            </Link>
          </p>
        </div>
        <LegalFooter />
      </div>
    </div>
  );
}
