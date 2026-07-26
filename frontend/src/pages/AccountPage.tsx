import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

export default function AccountPage() {
  const { user, authFetch, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authFetch('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      // Le changement révoque toutes les sessions, y compris celle-ci
      // (voir auth.controller.ts) — reconnexion nécessaire avec le
      // nouveau mot de passe plutôt que de laisser une session dont le
      // refresh échouera à la prochaine expiration de l'access token.
      setMessage('Mot de passe modifié. Reconnexion nécessaire.');
      setTimeout(() => logout(), 2000);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de changer le mot de passe pour le moment.');
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
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Mon compte</h1>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <p className="font-medium text-slate-900">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-sm text-slate-500">{user?.email}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <p className="text-sm font-medium text-slate-700 mb-4">Changer de mot de passe</p>

          {message ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {message}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password"
                placeholder="Mot de passe actuel"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
              <input
                type="password"
                placeholder="Nouveau mot de passe (8 caractères min.)"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
              <input
                type="password"
                placeholder="Confirmer le nouveau mot de passe"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
              />

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
              >
                {isSubmitting ? 'Modification…' : 'Changer le mot de passe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
