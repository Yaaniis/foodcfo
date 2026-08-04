import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass =
  'w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';

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
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-text-muted hover:text-accent">
        ← Retour à l'accueil
      </Link>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-6">Mon compte</h2>

      <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6">
        <p className="font-medium">
          {user?.firstName} {user?.lastName}
        </p>
        <p className="text-sm text-text-muted">{user?.email}</p>
      </div>

      <div className="bg-surface border border-border rounded-card-lg shadow-card p-6">
        <p className="text-sm font-medium text-text-muted mb-4">Changer de mot de passe</p>

        {message ? (
          <p className="text-sm text-good bg-good-soft border border-good/30 rounded-card-md px-3 py-2">{message}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              placeholder="Mot de passe actuel"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Nouveau mot de passe (8 caractères min.)"
              autoComplete="new-password"
              minLength={8}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Confirmer le nouveau mot de passe"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />

            {error && (
              <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={isSubmitting} className={primaryBtnClass}>
              {isSubmitting ? 'Modification…' : 'Changer le mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
