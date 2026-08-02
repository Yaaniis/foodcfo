import { useEffect, useState } from 'react';
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
  const { authFetch } = useAuth();

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
                    {shifts.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-700">
                          {s.user.firstName} {s.user.lastName} · {ROLE_LABELS[s.role]}
                        </span>
                        <span className="text-slate-500 shrink-0">
                          {s.startTime}–{s.endTime}
                          {s.isAbsent && <span className="ml-2 text-red-600 font-medium">Absent</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {schedule.status === 'DRAFT' && (
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
