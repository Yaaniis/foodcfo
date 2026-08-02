import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface CompletionItem {
  id: string;
  label: string;
  isChecked: boolean;
  checkedAt: string | null;
}

interface CompletionDetail {
  id: string;
  serviceDate: string;
  completedAt: string | null;
  template: { id: string; name: string };
  completedBy: { id: string; firstName: string; lastName: string };
  items: CompletionItem[];
}

function formatDateFr(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ChecklistCompletionPage() {
  const { completionId } = useParams<{ completionId: string }>();
  const { authFetch } = useAuth();

  const [completion, setCompletion] = useState<CompletionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await authFetch<{ completion: CompletionDetail }>(`/api/hygiene/checklist-completions/${completionId}`);
      setCompletion(data.completion);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger cette checklist.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionId]);

  async function handleToggle(item: CompletionItem) {
    setError(null);
    setTogglingId(item.id);
    try {
      const data = await authFetch<{ completion: CompletionDetail }>(
        `/api/hygiene/checklist-completions/${completionId}/items/${item.id}`,
        { method: 'PATCH', body: JSON.stringify({ isChecked: !item.isChecked }) },
      );
      setCompletion(data.completion);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de mettre à jour cet élément.');
    } finally {
      setTogglingId(null);
    }
  }

  const checkedCount = completion?.items.filter((i) => i.isChecked).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/hygiene" className="text-sm text-slate-500 underline">
          ← Retour à l'hygiène
        </Link>

        {isLoading && <p className="text-slate-500 mt-4">Chargement…</p>}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{error}</p>
        )}

        {completion && (
          <>
            <div className="flex items-center justify-between mt-2 mb-2">
              <h1 className="text-2xl font-bold text-slate-900">{completion.template.name}</h1>
              <span
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg ${
                  completion.completedAt
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {completion.completedAt ? 'Complétée' : 'En cours'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-6 capitalize">
              {formatDateFr(completion.serviceDate)} · {completion.completedBy.firstName} {completion.completedBy.lastName} ·{' '}
              {checkedCount}/{completion.items.length}
            </p>

            <ul className="space-y-2">
              {completion.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleToggle(item)}
                    disabled={togglingId === item.id}
                    className={`w-full min-h-[44px] flex items-center gap-3 rounded-xl border p-4 text-left disabled:opacity-50 ${
                      item.isChecked ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                        item.isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'
                      }`}
                    >
                      {item.isChecked ? '✓' : ''}
                    </span>
                    <span className={item.isChecked ? 'text-emerald-800' : 'text-slate-700'}>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
