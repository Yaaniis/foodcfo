import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setIsDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de réinitialiser le mot de passe.');
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
            <h2 className="font-display text-lg font-bold">Nouveau mot de passe</h2>
          </div>

          {!token ? (
            <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">
              Lien invalide.{' '}
              <Link to="/forgot-password" className="font-semibold hover:underline">
                Refaire une demande
              </Link>
              .
            </p>
          ) : isDone ? (
            <p className="text-sm text-good bg-good-soft border border-good/30 rounded-card-md px-3 py-2">
              Mot de passe mis à jour — redirection vers la connexion…
            </p>
          ) : (
            <>
              <p className="text-sm text-text-muted -mt-2">Choisis ton nouveau mot de passe.</p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="newPassword" className={labelClass}>
                    Nouveau mot de passe
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-xs text-text-faint">8 caractères minimum</p>
                </div>

                {error && (
                  <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
                )}

                <button type="submit" disabled={isSubmitting} className={primaryBtnClass}>
                  {isSubmitting ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
                </button>
              </form>
            </>
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
