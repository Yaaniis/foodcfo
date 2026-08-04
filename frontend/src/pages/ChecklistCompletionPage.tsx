import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import Badge from '../components/Badge';

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
    <div className="max-w-3xl">
      <Link to="/hygiene" className="text-sm text-text-muted hover:text-accent">
        ← Retour à l'hygiène
      </Link>

      {isLoading && <p className="text-text-faint mt-4">Chargement…</p>}
      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mt-4">{error}</p>
      )}

      {completion && (
        <>
          <div className="flex items-center justify-between gap-3 mt-2 mb-2">
            <h2 className="font-display text-2xl font-bold tracking-tight">{completion.template.name}</h2>
            <Badge tone={completion.completedAt ? 'success' : 'info'}>
              {completion.completedAt ? 'Complétée' : 'En cours'}
            </Badge>
          </div>
          <p className="text-sm text-text-muted mb-6 capitalize">
            {formatDateFr(completion.serviceDate)} · {completion.completedBy.firstName} {completion.completedBy.lastName} ·{' '}
            {checkedCount}/{completion.items.length}
          </p>

          <ul className="space-y-2">
            {completion.items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleToggle(item)}
                  disabled={togglingId === item.id}
                  className={`w-full min-h-[44px] flex items-center gap-3 rounded-card-md border p-4 text-left transition-colors disabled:opacity-50 ${
                    item.isChecked ? 'bg-good-soft border-good/30' : 'bg-surface border-border hover:bg-surface-hover'
                  }`}
                >
                  <span
                    className={`shrink-0 w-6 h-6 rounded-card-sm border-2 flex items-center justify-center text-sm font-bold ${
                      item.isChecked ? 'border-good bg-good-soft text-good' : 'border-border-strong'
                    }`}
                  >
                    {item.isChecked ? '✓' : ''}
                  </span>
                  <span className={item.isChecked ? 'text-good' : 'text-text'}>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
