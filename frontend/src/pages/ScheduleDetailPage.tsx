import { useEffect, useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth, type UserRole } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

type ScheduleStatus = 'DRAFT' | 'VALIDATED';

interface ShiftAssignment {
  id: string;
  user: { id: string; firstName: string; lastName: string; role: UserRole };
  role: UserRole;
  date: string;
  startTime: string;
  endTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  wasManuallyAdjusted: boolean;
  isAbsent: boolean;
  absenceNote: string | null;
}

interface ScheduleDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: ScheduleStatus;
  generatedAt: string;
  validatedAt: string | null;
  validatedBy: { id: string; firstName: string; lastName: string } | null;
  shiftAssignments: ShiftAssignment[];
}

const ROLE_LABELS: Record<UserRole, string> = { GERANT: 'Gérant', CUISINE: 'Cuisine', SERVICE: 'Service' };
const STATUS_LABELS: Record<ScheduleStatus, string> = { DRAFT: 'Brouillon', VALIDATED: 'Validé' };
const STATUS_STYLES: Record<ScheduleStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border border-amber-200',
  VALIDATED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

function formatDateFr(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ScheduleDetailPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const { authFetch, user } = useAuth();
  const canManage = user?.role === 'GERANT';

  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await authFetch<{ schedule: ScheduleDetail }>(`/api/planning/schedules/${scheduleId}`);
      setSchedule(data.schedule);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger ce planning.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  async function handleValidate() {
    setError(null);
    setIsValidating(true);
    try {
      const data = await authFetch<{ schedule: ScheduleDetail }>(`/api/planning/schedules/${scheduleId}/validate`, {
        method: 'POST',
      });
      setSchedule(data.schedule);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de valider ce planning.');
    } finally {
      setIsValidating(false);
    }
  }

  // --- Correction après coup (retard, absence) ---
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'present' | 'absent'>('present');
  const [editActualStart, setEditActualStart] = useState('');
  const [editActualEnd, setEditActualEnd] = useState('');
  const [editAbsenceNote, setEditAbsenceNote] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  function startEdit(shift: ShiftAssignment) {
    setEditingShiftId(shift.id);
    setEditMode(shift.isAbsent ? 'absent' : 'present');
    setEditActualStart(shift.actualStartTime ?? shift.startTime);
    setEditActualEnd(shift.actualEndTime ?? shift.endTime);
    setEditAbsenceNote(shift.absenceNote ?? '');
    setEditError(null);
  }

  async function submitAdjustment(shiftId: string, body: Record<string, unknown>) {
    setEditError(null);
    setIsSavingEdit(true);
    try {
      const data = await authFetch<{ schedule: ScheduleDetail }>(
        `/api/planning/schedules/${scheduleId}/shifts/${shiftId}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      setSchedule(data.schedule);
      setEditingShiftId(null);
    } catch (err) {
      setEditError(err instanceof ApiRequestError ? err.message : 'Impossible d’enregistrer cette correction.');
    } finally {
      setIsSavingEdit(false);
    }
  }

  function handleSaveEdit(e: FormEvent, shiftId: string) {
    e.preventDefault();
    if (editMode === 'absent') {
      submitAdjustment(shiftId, {
        isAbsent: true,
        absenceNote: editAbsenceNote || null,
        actualStartTime: null,
        actualEndTime: null,
      });
    } else {
      submitAdjustment(shiftId, {
        isAbsent: false,
        absenceNote: null,
        actualStartTime: editActualStart,
        actualEndTime: editActualEnd,
      });
    }
  }

  function handleClearAdjustment(shiftId: string) {
    submitAdjustment(shiftId, { isAbsent: false, absenceNote: null, actualStartTime: null, actualEndTime: null });
  }

  const shiftsByDate = (schedule?.shiftAssignments ?? []).reduce<Record<string, ShiftAssignment[]>>((acc, s) => {
    (acc[s.date] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/planning" className="text-sm text-slate-500 underline">
          ← Retour au planning
        </Link>

        {isLoading && <p className="text-slate-500 mt-4">Chargement…</p>}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{error}</p>
        )}

        {schedule && (
          <>
            <div className="flex items-center justify-between mt-2 mb-6">
              <h1 className="text-2xl font-bold text-slate-900">
                {formatDateFr(schedule.periodStart)} → {formatDateFr(schedule.periodEnd)}
              </h1>
              <span className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg ${STATUS_STYLES[schedule.status]}`}>
                {STATUS_LABELS[schedule.status]}
              </span>
            </div>

            {schedule.status === 'VALIDATED' && schedule.validatedBy && (
              <p className="text-sm text-slate-500 mb-6">
                Validé par {schedule.validatedBy.firstName} {schedule.validatedBy.lastName} le{' '}
                {new Date(schedule.validatedAt!).toLocaleDateString('fr-FR')}
              </p>
            )}

            {Object.keys(shiftsByDate).length === 0 && (
              <p className="text-slate-500 mb-6">Aucun créneau affecté sur cette période.</p>
            )}

            <div className="space-y-4 mb-6">
              {Object.entries(shiftsByDate).map(([date, shifts]) => (
                <div key={date} className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900 mb-3 capitalize">{formatDateFr(date)}</p>
                  <ul className="space-y-2">
                    {shifts.map((s) =>
                      editingShiftId === s.id ? (
                        <li key={s.id} className="rounded-xl border border-slate-200 p-3">
                          <form onSubmit={(e) => handleSaveEdit(e, s.id)} className="space-y-3">
                            <p className="text-sm font-medium text-slate-700">
                              {s.user.firstName} {s.user.lastName} · {ROLE_LABELS[s.role]}
                            </p>
                            <div className="flex gap-4 text-sm">
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  checked={editMode === 'present'}
                                  onChange={() => setEditMode('present')}
                                />
                                Présent (corriger les heures)
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  checked={editMode === 'absent'}
                                  onChange={() => setEditMode('absent')}
                                />
                                Absent
                              </label>
                            </div>
                            {editMode === 'present' ? (
                              <div className="grid grid-cols-2 gap-3">
                                <label className="text-xs text-slate-600">
                                  Début effectif
                                  <input
                                    type="time"
                                    required
                                    value={editActualStart}
                                    onChange={(e) => setEditActualStart(e.target.value)}
                                    className="mt-1 w-full min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm"
                                  />
                                </label>
                                <label className="text-xs text-slate-600">
                                  Fin effective
                                  <input
                                    type="time"
                                    required
                                    value={editActualEnd}
                                    onChange={(e) => setEditActualEnd(e.target.value)}
                                    className="mt-1 w-full min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm"
                                  />
                                </label>
                              </div>
                            ) : (
                              <input
                                placeholder="Motif (optionnel)"
                                value={editAbsenceNote}
                                onChange={(e) => setEditAbsenceNote(e.target.value)}
                                className="w-full min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm"
                              />
                            )}
                            {editError && (
                              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                {editError}
                              </p>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={isSavingEdit}
                                className="flex-1 min-h-[40px] rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
                              >
                                {isSavingEdit ? 'Enregistrement…' : 'Enregistrer'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingShiftId(null)}
                                className="flex-1 min-h-[40px] rounded-lg border border-slate-300 text-sm font-medium"
                              >
                                Annuler
                              </button>
                            </div>
                          </form>
                        </li>
                      ) : (
                        <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-700 min-w-0">
                            {s.user.firstName} {s.user.lastName} · {ROLE_LABELS[s.role]}
                            {s.wasManuallyAdjusted && (
                              <span className="ml-2 text-xs text-slate-400 font-normal">(ajusté)</span>
                            )}
                          </span>
                          <span className="text-slate-500 shrink-0 flex items-center gap-2">
                            {s.isAbsent ? (
                              <span className="text-red-600 font-medium">
                                Absent{s.absenceNote ? ` · ${s.absenceNote}` : ''}
                              </span>
                            ) : (
                              <>
                                {s.startTime}–{s.endTime}
                                {s.actualStartTime && s.actualEndTime && (
                                  <span className="text-slate-400">
                                    {' '}
                                    (effectif {s.actualStartTime}–{s.actualEndTime})
                                  </span>
                                )}
                              </>
                            )}
                            {canManage && schedule.status === 'VALIDATED' && (
                              <button
                                onClick={() => startEdit(s)}
                                className="min-h-[32px] px-2 rounded-lg border border-slate-300 text-xs font-medium"
                              >
                                Corriger
                              </button>
                            )}
                            {canManage && schedule.status === 'VALIDATED' && s.wasManuallyAdjusted && (
                              <button
                                onClick={() => handleClearAdjustment(s.id)}
                                className="min-h-[32px] px-2 rounded-lg border border-slate-300 text-xs font-medium"
                              >
                                Effacer
                              </button>
                            )}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ))}
            </div>

            {canManage && schedule.status === 'DRAFT' && (
              <button
                onClick={handleValidate}
                disabled={isValidating}
                className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
              >
                {isValidating ? 'Validation…' : 'Valider ce planning (définitif)'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
