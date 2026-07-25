import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest, ApiRequestError } from '../lib/apiClient';
import LegalFooter from '../components/LegalFooter';

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Nouveau mot de passe</h1>

          {!token ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">
              Lien invalide.{' '}
              <Link to="/forgot-password" className="underline font-medium">
                Refaire une demande
              </Link>
              .
            </p>
          ) : isDone ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-4">
              Mot de passe mis à jour — redirection vers la connexion…
            </p>
          ) : (
            <>
              <p className="text-slate-500 mb-6">Choisis ton nouveau mot de passe.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1">
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
                  {isSubmitting ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
                </button>
              </form>
            </>
          )}

          <p className="text-sm text-slate-500 mt-6 text-center">
            <Link to="/login" className="text-slate-900 font-medium underline">
              ← Retour à la connexion
            </Link>
          </p>
        </div>
        <LegalFooter />
      </div>
    </div>
  );
}
