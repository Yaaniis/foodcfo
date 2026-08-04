import { useEffect, useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth, type UserRole } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import Badge, { type BadgeTone } from '../components/Badge';

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

// Même mapping que sur la liste des plannings (PlanningPage.tsx) et
// que celui déjà validé dans l'artefact : brouillon = neutre, validé = succès.
const STATUS_TONE: Record<ScheduleStatus, BadgeTone> = {
  DRAFT: 'neutral',
  VALIDATED: 'success',
};

const primaryBtnClass =
  'w-full min-h-[44px] rounded-card-md bg-accent text-accent-text font-medium disabled:opacity-50 hover:brightness-105';
const editInputClass =
  'w-full min-h-[40px] rounded-card-sm border border-border bg-surface px-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const editPrimaryBtnClass =
  'flex-1 min-h-[40px] rounded-card-sm bg-accent text-accent-text text-sm font-medium disabled:opacity-50 hover:brightness-105';
const editSecondaryBtnClass = 'flex-1 min-h-[40px] rounded-card-sm border border-border text-sm font-medium hover:border-border-strong';
const chipBtnClass =
  'min-h-[32px] px-2 rounded-card-sm border border-border text-xs font-medium text-text-muted hover:border-border-strong hover:text-text';

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
    <div className="max-w-3xl">
      <Link to="/planning" className="text-sm text-text-muted hover:text-accent">
        ← Retour au planning
      </Link>

      {isLoading && <p className="text-text-faint mt-4">Chargement…</p>}
      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mt-4">{error}</p>
      )}

      {schedule && (
        <>
          <div className="flex items-center justify-between gap-3 mt-2 mb-6">
            <h2 className="font-display text-2xl font-bold tracking-tight">
              {formatDateFr(schedule.periodStart)} → {formatDateFr(schedule.periodEnd)}
            </h2>
            <Badge tone={STATUS_TONE[schedule.status]}>{STATUS_LABELS[schedule.status]}</Badge>
          </div>

          {schedule.status === 'VALIDATED' && schedule.validatedBy && (
            <p className="text-sm text-text-muted mb-6">
              Validé par {schedule.validatedBy.firstName} {schedule.validatedBy.lastName} le{' '}
              {new Date(schedule.validatedAt!).toLocaleDateString('fr-FR')}
            </p>
          )}

          {Object.keys(shiftsByDate).length === 0 && (
            <p className="text-text-faint mb-6">Aucun créneau affecté sur cette période.</p>
          )}

          <div className="space-y-4 mb-6">
            {Object.entries(shiftsByDate).map(([date, shifts]) => (
              <div key={date} className="bg-surface border border-border rounded-card-lg shadow-card p-4">
                <p className="font-medium mb-3 capitalize">{formatDateFr(date)}</p>
                <ul className="space-y-2">
                  {shifts.map((s) =>
                    editingShiftId === s.id ? (
                      <li key={s.id} className="rounded-card-md border border-border p-3">
                        <form onSubmit={(e) => handleSaveEdit(e, s.id)} className="space-y-3">
                          <p className="text-sm font-medium text-text">
                            {s.user.firstName} {s.user.lastName} · {ROLE_LABELS[s.role]}
                          </p>
                          <div className="flex gap-4 text-sm text-text-muted">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                checked={editMode === 'present'}
                                onChange={() => setEditMode('present')}
                                className="accent-accent"
                              />
                              Présent (corriger les heures)
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                checked={editMode === 'absent'}
                                onChange={() => setEditMode('absent')}
                                className="accent-accent"
                              />
                              Absent
                            </label>
                          </div>
                          {editMode === 'present' ? (
                            <div className="grid grid-cols-2 gap-3">
                              <label className="text-xs text-text-faint">
                                Début effectif
                                <input
                                  type="time"
                                  required
                                  value={editActualStart}
                                  onChange={(e) => setEditActualStart(e.target.value)}
                                  className={`mt-1 ${editInputClass}`}
                                />
                              </label>
                              <label className="text-xs text-text-faint">
                                Fin effective
                                <input
                                  type="time"
                                  required
                                  value={editActualEnd}
                                  onChange={(e) => setEditActualEnd(e.target.value)}
                                  className={`mt-1 ${editInputClass}`}
                                />
                              </label>
                            </div>
                          ) : (
                            <input
                              placeholder="Motif (optionnel)"
                              value={editAbsenceNote}
                              onChange={(e) => setEditAbsenceNote(e.target.value)}
                              className={editInputClass}
                            />
                          )}
                          {editError && (
                            <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">
                              {editError}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <button type="submit" disabled={isSavingEdit} className={editPrimaryBtnClass}>
                              {isSavingEdit ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                            <button type="button" onClick={() => setEditingShiftId(null)} className={editSecondaryBtnClass}>
                              Annuler
                            </button>
                          </div>
                        </form>
                      </li>
                    ) : (
                      <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-text min-w-0">
                          {s.user.firstName} {s.user.lastName} · {ROLE_LABELS[s.role]}
                          {s.wasManuallyAdjusted && (
                            <span className="ml-2 text-xs text-text-faint font-normal">(ajusté)</span>
                          )}
                        </span>
                        <span className="text-text-muted shrink-0 flex items-center gap-2">
                          {s.isAbsent ? (
                            <span className="text-danger font-medium">
                              Absent{s.absenceNote ? ` · ${s.absenceNote}` : ''}
                            </span>
                          ) : (
                            <>
                              {s.startTime}–{s.endTime}
                              {s.actualStartTime && s.actualEndTime && (
                                <span className="text-text-faint">
                                  {' '}
                                  (effectif {s.actualStartTime}–{s.actualEndTime})
                                </span>
                              )}
                            </>
                          )}
                          {canManage && schedule.status === 'VALIDATED' && (
                            <button onClick={() => startEdit(s)} className={chipBtnClass}>
                              Corriger
                            </button>
                          )}
                          {canManage && schedule.status === 'VALIDATED' && s.wasManuallyAdjusted && (
                            <button onClick={() => handleClearAdjustment(s.id)} className={chipBtnClass}>
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
            <button onClick={handleValidate} disabled={isValidating} className={primaryBtnClass}>
              {isValidating ? 'Validation…' : 'Valider ce planning (définitif)'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
