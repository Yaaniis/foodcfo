import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, type UserRole } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
type ScheduleStatus = 'DRAFT' | 'VALIDATED';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
}

interface Availability {
  id: string;
  weekday: Weekday | null;
  specificDate: string | null;
  reason: string | null;
  user: { id: string; firstName: string; lastName: string };
}

interface StaffingRequirement {
  id: string;
  weekday: Weekday;
  role: UserRole;
  startTime: string;
  endTime: string;
  requiredCount: number;
}

interface ScheduleSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: ScheduleStatus;
  generatedAt: string;
  shiftAssignments: unknown[];
}

interface GenerateResult {
  schedule: ScheduleSummary;
  unmetRequirements: { date: string; role: UserRole; startTime: string; endTime: string; missingCount: number }[];
  employeeIdsWithoutRestDay: string[];
}

const WEEKDAY_LABELS: Record<Weekday, string> = {
  MONDAY: 'Lundi',
  TUESDAY: 'Mardi',
  WEDNESDAY: 'Mercredi',
  THURSDAY: 'Jeudi',
  FRIDAY: 'Vendredi',
  SATURDAY: 'Samedi',
  SUNDAY: 'Dimanche',
};
const WEEKDAYS = Object.keys(WEEKDAY_LABELS) as Weekday[];

const ROLE_LABELS: Record<UserRole, string> = { GERANT: 'Gérant', CUISINE: 'Cuisine', SERVICE: 'Service' };

const STATUS_LABELS: Record<ScheduleStatus, string> = { DRAFT: 'Brouillon', VALIDATED: 'Validé' };
const STATUS_STYLES: Record<ScheduleStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border border-amber-200',
  VALIDATED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

function formatDateFr(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}

export default function PlanningPage() {
  const { authFetch, accessToken } = useAuth();
  const [tab, setTab] = useState<'schedules' | 'availabilities' | 'requirements'>('schedules');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [requirements, setRequirements] = useState<StaffingRequirement[]>([]);
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setIsLoading(true);
    setError(null);
    try {
      const [usersData, availData, reqData, schedData] = await Promise.all([
        authFetch<{ users: Employee[] }>('/api/users'),
        authFetch<{ availabilities: Availability[] }>('/api/planning/availabilities'),
        authFetch<{ staffingRequirements: StaffingRequirement[] }>('/api/planning/staffing-requirements'),
        authFetch<{ schedules: ScheduleSummary[] }>('/api/planning/schedules'),
      ]);
      setEmployees(usersData.users.filter((u) => u.isActive));
      setAvailabilities(availData.availabilities);
      setRequirements(reqData.staffingRequirements);
      setSchedules(schedData.schedules);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger le planning.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Disponibilités ---
  const [showAvailForm, setShowAvailForm] = useState(false);
  const [availUserId, setAvailUserId] = useState('');
  const [availMode, setAvailMode] = useState<'weekday' | 'date'>('weekday');
  const [availWeekday, setAvailWeekday] = useState<Weekday>('MONDAY');
  const [availDate, setAvailDate] = useState('');
  const [availReason, setAvailReason] = useState('');
  const [availError, setAvailError] = useState<string | null>(null);
  const [isCreatingAvail, setIsCreatingAvail] = useState(false);

  async function handleCreateAvailability(e: FormEvent) {
    e.preventDefault();
    setAvailError(null);
    setIsCreatingAvail(true);
    try {
      await authFetch('/api/planning/availabilities', {
        method: 'POST',
        body: JSON.stringify({
          userId: availUserId,
          weekday: availMode === 'weekday' ? availWeekday : undefined,
          specificDate: availMode === 'date' ? availDate : undefined,
          reason: availReason || undefined,
        }),
      });
      setAvailReason('');
      setShowAvailForm(false);
      await loadAll();
    } catch (err) {
      setAvailError(err instanceof ApiRequestError ? err.message : 'Impossible de créer cette règle.');
    } finally {
      setIsCreatingAvail(false);
    }
  }

  async function handleDeleteAvailability(id: string) {
    try {
      await authFetch(`/api/planning/availabilities/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de supprimer cette règle.');
    }
  }

  // --- Besoins de staffing ---
  const [showReqForm, setShowReqForm] = useState(false);
  const [reqWeekday, setReqWeekday] = useState<Weekday>('MONDAY');
  const [reqRole, setReqRole] = useState<UserRole>('SERVICE');
  const [reqStart, setReqStart] = useState('11:00');
  const [reqEnd, setReqEnd] = useState('15:00');
  const [reqCount, setReqCount] = useState('1');
  const [reqError, setReqError] = useState<string | null>(null);
  const [isCreatingReq, setIsCreatingReq] = useState(false);

  async function handleCreateRequirement(e: FormEvent) {
    e.preventDefault();
    setReqError(null);
    setIsCreatingReq(true);
    try {
      await authFetch('/api/planning/staffing-requirements', {
        method: 'POST',
        body: JSON.stringify({
          weekday: reqWeekday,
          role: reqRole,
          startTime: reqStart,
          endTime: reqEnd,
          requiredCount: Number(reqCount),
        }),
      });
      setShowReqForm(false);
      await loadAll();
    } catch (err) {
      setReqError(err instanceof ApiRequestError ? err.message : 'Impossible de créer ce besoin.');
    } finally {
      setIsCreatingReq(false);
    }
  }

  async function handleDeleteRequirement(id: string) {
    try {
      await authFetch(`/api/planning/staffing-requirements/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de supprimer ce besoin.');
    }
  }

  // --- Génération de planning ---
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [genError, setGenError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setGenError(null);
    setGenResult(null);
    setIsGenerating(true);
    try {
      const res = await authFetch<GenerateResult>('/api/planning/schedules/generate', {
        method: 'POST',
        body: JSON.stringify({ periodStart, periodEnd }),
      });
      setGenResult(res);
      await loadAll();
    } catch (err) {
      setGenError(err instanceof ApiRequestError ? err.message : 'Impossible de générer ce planning.');
    } finally {
      setIsGenerating(false);
    }
  }

  function employeeName(userId: string): string {
    const emp = employees.find((e) => e.id === userId);
    return emp ? `${emp.firstName} ${emp.lastName}` : 'Employé inconnu';
  }

  // --- Récapitulatif d'heures pour le comptable ---
  const [exportPeriodStart, setExportPeriodStart] = useState('');
  const [exportPeriodEnd, setExportPeriodEnd] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExportHours() {
    setExportError(null);
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (exportPeriodStart) params.set('periodStart', exportPeriodStart);
      if (exportPeriodEnd) params.set('periodEnd', exportPeriodEnd);
      const res = await fetch(`${API_BASE_URL}/api/planning/hours-summary.csv?${params.toString()}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) {
        throw new Error("Impossible de générer le récapitulatif.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `recapitulatif_heures_${exportPeriodStart || 'periode'}_${exportPeriodEnd || 'courante'}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Impossible de télécharger le récapitulatif.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← Retour à l'accueil
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Planning</h1>

        <div className="flex gap-2 mb-6 border-b border-slate-200">
          {(
            [
              ['schedules', 'Plannings'],
              ['availabilities', 'Disponibilités'],
              ['requirements', 'Besoins'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`min-h-[44px] px-4 font-medium border-b-2 -mb-px ${
                tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}
        {isLoading && <p className="text-slate-500">Chargement…</p>}

        {!isLoading && tab === 'schedules' && (
          <>
            <form onSubmit={handleGenerate} className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-4">
              <p className="text-sm text-slate-500">
                Génère un planning brouillon à partir des besoins de staffing et des disponibilités saisis. À vérifier
                et valider avant qu'il devienne définitif.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-slate-600">
                  Du
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Au
                  <input
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </label>
              </div>
              {genError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{genError}</p>
              )}
              <button
                type="submit"
                disabled={isGenerating}
                className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
              >
                {isGenerating ? 'Génération…' : 'Générer un planning'}
              </button>
            </form>

            {genResult && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-3">
                <p className="font-medium text-slate-900">
                  Planning généré : {genResult.schedule.shiftAssignments.length} créneau(x) affecté(s).
                </p>
                {genResult.unmetRequirements.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-sm font-medium text-red-700 mb-1">Besoins non couverts :</p>
                    <ul className="text-sm text-red-600 list-disc list-inside">
                      {genResult.unmetRequirements.map((u, i) => (
                        <li key={i}>
                          {formatDateFr(u.date)} · {ROLE_LABELS[u.role]} {u.startTime}–{u.endTime} : {u.missingCount}
                          {' '}
                          personne(s) manquante(s)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {genResult.employeeIdsWithoutRestDay.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <p className="text-sm font-medium text-amber-700 mb-1">
                      Aucun jour de repos sur la période (à vérifier avant validation) :
                    </p>
                    <ul className="text-sm text-amber-700 list-disc list-inside">
                      {genResult.employeeIdsWithoutRestDay.map((id) => (
                        <li key={id}>{employeeName(id)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link
                  to={`/planning/schedules/${genResult.schedule.id}`}
                  className="inline-block text-sm font-medium underline text-slate-900"
                >
                  Voir le planning généré →
                </Link>
              </div>
            )}

            <ul className="space-y-2">
              {schedules.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/planning/schedules/${s.id}`}
                    className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {formatDateFr(s.periodStart)} → {formatDateFr(s.periodEnd)}
                        </p>
                        <p className="text-sm text-slate-500">{s.shiftAssignments.length} créneau(x)</p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg ${STATUS_STYLES[s.status]}`}>
                        {STATUS_LABELS[s.status]}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
              {schedules.length === 0 && <p className="text-slate-500">Aucun planning généré pour l'instant.</p>}
            </ul>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6 space-y-4">
              <div>
                <p className="font-medium text-slate-900">Récapitulatif d'heures pour le comptable</p>
                <p className="text-sm text-slate-500">
                  Heures normales, supplémentaires, dimanches et jours fériés, calculées à partir des plannings
                  validés sur la période. Sans dates, le mois en cours est utilisé.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-slate-600">
                  Du
                  <input
                    type="date"
                    value={exportPeriodStart}
                    onChange={(e) => setExportPeriodStart(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Au
                  <input
                    type="date"
                    value={exportPeriodEnd}
                    onChange={(e) => setExportPeriodEnd(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </label>
              </div>
              {exportError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {exportError}
                </p>
              )}
              <button
                onClick={handleExportHours}
                disabled={isExporting}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 font-medium disabled:opacity-50"
              >
                {isExporting ? 'Génération…' : 'Télécharger le récapitulatif (CSV)'}
              </button>
            </div>
          </>
        )}

        {!isLoading && tab === 'availabilities' && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowAvailForm((v) => !v)}
                className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium"
              >
                {showAvailForm ? 'Annuler' : '+ Ajouter'}
              </button>
            </div>

            {showAvailForm && (
              <form
                onSubmit={handleCreateAvailability}
                className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-4"
              >
                <select
                  required
                  value={availUserId}
                  onChange={(e) => setAvailUserId(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">Choisir un employé…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({ROLE_LABELS[emp.role]})
                    </option>
                  ))}
                </select>

                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={availMode === 'weekday'}
                      onChange={() => setAvailMode('weekday')}
                    />
                    Récurrente (jour de semaine)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={availMode === 'date'} onChange={() => setAvailMode('date')} />
                    Ponctuelle (date précise)
                  </label>
                </div>

                {availMode === 'weekday' ? (
                  <select
                    value={availWeekday}
                    onChange={(e) => setAvailWeekday(e.target.value as Weekday)}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {WEEKDAYS.map((w) => (
                      <option key={w} value={w}>
                        {WEEKDAY_LABELS[w]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="date"
                    required
                    value={availDate}
                    onChange={(e) => setAvailDate(e.target.value)}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                )}

                <input
                  placeholder="Motif (optionnel)"
                  value={availReason}
                  onChange={(e) => setAvailReason(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                />

                {availError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {availError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isCreatingAvail}
                  className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
                >
                  {isCreatingAvail ? 'Création…' : 'Créer cette règle'}
                </button>
              </form>
            )}

            <ul className="space-y-2">
              {availabilities.map((a) => (
                <li
                  key={a.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {a.user.firstName} {a.user.lastName}
                    </p>
                    <p className="text-sm text-slate-500 truncate">
                      Indisponible {a.weekday ? `tous les ${WEEKDAY_LABELS[a.weekday].toLowerCase()}s` : `le ${formatDateFr(a.specificDate!)}`}
                      {a.reason ? ` · ${a.reason}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteAvailability(a.id)}
                    className="shrink-0 min-h-[44px] px-3 rounded-lg border border-slate-300 text-sm font-medium"
                  >
                    Supprimer
                  </button>
                </li>
              ))}
              {availabilities.length === 0 && <p className="text-slate-500">Aucune règle de disponibilité.</p>}
            </ul>
          </>
        )}

        {!isLoading && tab === 'requirements' && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowReqForm((v) => !v)}
                className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium"
              >
                {showReqForm ? 'Annuler' : '+ Ajouter'}
              </button>
            </div>

            {showReqForm && (
              <form
                onSubmit={handleCreateRequirement}
                className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={reqWeekday}
                    onChange={(e) => setReqWeekday(e.target.value as Weekday)}
                    className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {WEEKDAYS.map((w) => (
                      <option key={w} value={w}>
                        {WEEKDAY_LABELS[w]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={reqRole}
                    onChange={(e) => setReqRole(e.target.value as UserRole)}
                    className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="GERANT">Gérant</option>
                    <option value="CUISINE">Cuisine</option>
                    <option value="SERVICE">Service</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm text-slate-600">
                    Début
                    <input
                      type="time"
                      required
                      value={reqStart}
                      onChange={(e) => setReqStart(e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Fin
                    <input
                      type="time"
                      required
                      value={reqEnd}
                      onChange={(e) => setReqEnd(e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </label>
                </div>
                <label className="text-sm text-slate-600 block">
                  Nombre de personnes requises
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={reqCount}
                    onChange={(e) => setReqCount(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </label>

                {reqError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{reqError}</p>
                )}

                <button
                  type="submit"
                  disabled={isCreatingReq}
                  className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
                >
                  {isCreatingReq ? 'Création…' : 'Créer ce besoin'}
                </button>
              </form>
            )}

            <ul className="space-y-2">
              {requirements.map((r) => (
                <li
                  key={r.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {WEEKDAY_LABELS[r.weekday]} · {ROLE_LABELS[r.role]}
                    </p>
                    <p className="text-sm text-slate-500 truncate">
                      {r.startTime}–{r.endTime} · {r.requiredCount} personne(s)
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteRequirement(r.id)}
                    className="shrink-0 min-h-[44px] px-3 rounded-lg border border-slate-300 text-sm font-medium"
                  >
                    Supprimer
                  </button>
                </li>
              ))}
              {requirements.length === 0 && <p className="text-slate-500">Aucun besoin de staffing.</p>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
