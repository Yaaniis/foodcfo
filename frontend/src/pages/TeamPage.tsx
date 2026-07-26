import { useEffect, useState, type FormEvent } from 'react';
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
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Équipe</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium"
          >
            {showForm ? 'Annuler' : '+ Ajouter'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Prénom"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <input
                placeholder="Nom"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <input
              type="password"
              placeholder="Mot de passe (8 caractères min.)"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="GERANT">Gérant</option>
              <option value="CUISINE">Cuisine</option>
              <option value="SERVICE">Service</option>
            </select>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Création…' : 'Créer cet utilisateur'}
            </button>
          </form>
        )}

        {isLoading && <p className="text-slate-500">Chargement…</p>}
        {loadError && <p className="text-red-600">{loadError}</p>}

        <ul className="space-y-2">
          {members.map((m) =>
            editingId === m.id ? (
              <li key={m.id}>
                <form
                  onSubmit={(e) => handleUpdate(e, m.id)}
                  className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      required
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                    />
                    <input
                      required
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                    />
                  </div>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3"
                  >
                    <option value="GERANT">Gérant</option>
                    <option value="CUISINE">Cuisine</option>
                    <option value="SERVICE">Service</option>
                  </select>
                  {editError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {editError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 min-h-[44px] rounded-lg bg-slate-900 text-white font-medium"
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 min-h-[44px] rounded-lg border border-slate-300 font-medium"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li
                key={m.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="text-sm text-slate-500 truncate">
                    {m.email} · {ROLE_LABELS[m.role]}
                  </p>
                </div>
                <div className="shrink-0 flex gap-2">
                  <button
                    onClick={() => startEdit(m)}
                    className="min-h-[44px] px-3 rounded-lg border border-slate-300 text-sm font-medium"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => toggleActive(m)}
                    className={`min-h-[44px] px-3 rounded-lg text-sm font-medium ${
                      m.isActive ? 'bg-slate-100 text-slate-700' : 'bg-red-50 text-red-600'
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
    </div>
  );
}
