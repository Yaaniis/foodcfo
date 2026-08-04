import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, type UserRole } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
}

const ROLE_LABELS: Record<UserRole, string> = {
  GERANT: 'Gérant',
  CUISINE: 'Cuisine',
  SERVICE: 'Service',
};

const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass =
  'min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';
const secondaryBtnClass = 'min-h-[44px] px-3 rounded-card-md border border-border text-sm font-medium hover:border-border-strong';

export default function TeamPage() {
  const { authFetch } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('SERVICE');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('SERVICE');
  const [editError, setEditError] = useState<string | null>(null);

  async function loadMembers() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await authFetch<{ users: TeamMember[] }>('/api/users');
      setMembers(data.users);
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : 'Impossible de charger l\'équipe.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, email, password, role }),
      });
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setRole('SERVICE');
      setShowForm(false);
      await loadMembers();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Impossible de créer cet utilisateur.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleActive(member: TeamMember) {
    try {
      await authFetch(`/api/users/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !member.isActive }),
      });
      await loadMembers();
    } catch (err) {
      setLoadError(
        err instanceof ApiRequestError ? err.message : 'Impossible de modifier cet utilisateur pour le moment.',
      );
    }
  }

  function startEdit(member: TeamMember) {
    setEditingId(member.id);
    setEditFirstName(member.firstName);
    setEditLastName(member.lastName);
    setEditRole(member.role);
    setEditError(null);
  }

  async function handleUpdate(e: FormEvent, id: string) {
    e.preventDefault();
    setEditError(null);
    try {
      await authFetch(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ firstName: editFirstName, lastName: editLastName, role: editRole }),
      });
      setEditingId(null);
      await loadMembers();
    } catch (err) {
      setEditError(err instanceof ApiRequestError ? err.message : 'Impossible de modifier cet utilisateur.');
    }
  }

  return (
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-text-muted hover:text-accent">
        ← Retour à l'accueil
      </Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight">Équipe</h2>
        <button onClick={() => setShowForm((v) => !v)} className={primaryBtnClass}>
          {showForm ? 'Annuler' : '+ Ajouter'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Prénom"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder="Nom"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
            />
          </div>
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            placeholder="Mot de passe (8 caractères min.)"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
            <option value="GERANT">Gérant</option>
            <option value="CUISINE">Cuisine</option>
            <option value="SERVICE">Service</option>
          </select>

          {formError && (
            <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{formError}</p>
          )}

          <button type="submit" disabled={isSubmitting} className={`w-full ${primaryBtnClass}`}>
            {isSubmitting ? 'Création…' : 'Créer cet utilisateur'}
          </button>
        </form>
      )}

      {isLoading && <p className="text-text-faint">Chargement…</p>}
      {loadError && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-4">{loadError}</p>
      )}

      <ul className="space-y-2">
        {members.map((m) =>
          editingId === m.id ? (
            <li key={m.id}>
              <form
                onSubmit={(e) => handleUpdate(e, m.id)}
                className="bg-surface border border-border rounded-card-lg shadow-card p-4 space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <input
                    required
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    required
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} className={inputClass}>
                  <option value="GERANT">Gérant</option>
                  <option value="CUISINE">Cuisine</option>
                  <option value="SERVICE">Service</option>
                </select>
                {editError && (
                  <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">
                    {editError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="submit" className={`flex-1 ${primaryBtnClass}`}>
                    Enregistrer
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className={`flex-1 ${secondaryBtnClass}`}>
                    Annuler
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li
              key={m.id}
              className="bg-surface border border-border rounded-card-lg shadow-card p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {m.firstName} {m.lastName}
                </p>
                <p className="text-sm text-text-faint truncate">
                  {m.email} · {ROLE_LABELS[m.role]}
                </p>
              </div>
              <div className="shrink-0 flex gap-2">
                <button onClick={() => startEdit(m)} className={secondaryBtnClass}>
                  Modifier
                </button>
                <button
                  onClick={() => toggleActive(m)}
                  className={`min-h-[44px] px-3 rounded-card-md text-sm font-medium ${
                    m.isActive ? 'bg-surface-hover text-text-muted' : 'bg-danger-soft text-danger'
                  }`}
                >
                  {m.isActive ? 'Actif' : 'Désactivé'}
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
