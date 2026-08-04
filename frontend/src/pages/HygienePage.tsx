import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

interface ReferenceItem {
  id: string;
  title: string;
  content: string;
  hasMedia: boolean;
  createdAt: string;
}

interface ChecklistTemplateItem {
  id: string;
  label: string;
  order: number;
}

interface ChecklistTemplate {
  id: string;
  name: string;
  items: ChecklistTemplateItem[];
}

interface ChecklistCompletion {
  id: string;
  serviceDate: string;
  completedAt: string | null;
  template: { id: string; name: string };
  completedBy: { id: string; firstName: string; lastName: string };
}

const TABLE_COLS = 'grid-cols-[1fr_110px_120px]';

const inputClass =
  'w-full min-h-[44px] rounded-card-md border border-border bg-surface px-3 text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const primaryBtnClass =
  'min-h-[44px] px-4 rounded-card-md bg-accent text-accent-text font-medium hover:brightness-105 disabled:opacity-50';
const secondaryBtnClass = 'min-h-[44px] px-4 rounded-card-md border border-border text-sm font-medium hover:border-border-strong';
const dangerBtnClass =
  'min-h-[44px] px-3 rounded-card-md border border-danger/40 text-danger text-sm font-medium hover:bg-danger-soft';

// Une image protégée par JWT ne peut pas être chargée par un simple
// <img src="..."> (pas de header Authorization possible) — on la
// récupère nous-mêmes en blob, comme les téléchargements CSV
// (ReportsPage.tsx/PlanningPage.tsx), puis on l'affiche via une URL
// objet locale, nettoyée au démontage.
function ReferenceItemThumbnail({ itemId, accessToken }: { itemId: string; accessToken: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/hygiene/reference-items/${itemId}/media`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        // Pas grave si l'image ne charge pas : la carte reste utilisable sans.
      }
    }
    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId, accessToken]);

  if (!url) return null;
  return <img src={url} alt="" className="w-full h-32 object-cover rounded-card-md mb-2" />;
}

export default function HygienePage() {
  const { authFetch, accessToken, user } = useAuth();
  const navigate = useNavigate();
  const canManage = user?.role === 'GERANT';
  const [tab, setTab] = useState<'rappels' | 'checklists'>('rappels');

  const [referenceItems, setReferenceItems] = useState<ReferenceItem[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [completions, setCompletions] = useState<ChecklistCompletion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setIsLoading(true);
    setError(null);
    try {
      const [itemsData, templatesData, completionsData] = await Promise.all([
        authFetch<{ referenceItems: ReferenceItem[] }>('/api/hygiene/reference-items'),
        authFetch<{ templates: ChecklistTemplate[] }>('/api/hygiene/checklist-templates'),
        authFetch<{ completions: ChecklistCompletion[] }>('/api/hygiene/checklist-completions'),
      ]);
      setReferenceItems(itemsData.referenceItems);
      setTemplates(templatesData.templates);
      setCompletions(completionsData.completions);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger les données.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Rappels ---
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemTitle, setItemTitle] = useState('');
  const [itemContent, setItemContent] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const itemFileRef = useRef<HTMLInputElement>(null);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemContent, setEditItemContent] = useState('');

  async function handleCreateItem(e: FormEvent) {
    e.preventDefault();
    setItemError(null);
    setIsSavingItem(true);
    try {
      const formData = new FormData();
      formData.append('title', itemTitle);
      formData.append('content', itemContent);
      const file = itemFileRef.current?.files?.[0];
      if (file) formData.append('media', file);
      await authFetch('/api/hygiene/reference-items', { method: 'POST', body: formData });
      setItemTitle('');
      setItemContent('');
      if (itemFileRef.current) itemFileRef.current.value = '';
      setShowItemForm(false);
      await loadAll();
    } catch (err) {
      setItemError(err instanceof ApiRequestError ? err.message : 'Impossible de créer ce rappel.');
    } finally {
      setIsSavingItem(false);
    }
  }

  function startEditItem(item: ReferenceItem) {
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
    setEditItemContent(item.content);
  }

  async function handleUpdateItem(e: FormEvent, id: string) {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('title', editItemTitle);
      formData.append('content', editItemContent);
      await authFetch(`/api/hygiene/reference-items/${id}`, { method: 'PATCH', body: formData });
      setEditingItemId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de modifier ce rappel.');
    }
  }

  async function handleDeleteItem(id: string) {
    try {
      await authFetch(`/api/hygiene/reference-items/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de supprimer ce rappel.');
    }
  }

  // --- Modèles de checklist ---
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateItemsText, setTemplateItemsText] = useState('');
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  async function handleCreateTemplate(e: FormEvent) {
    e.preventDefault();
    setTemplateError(null);
    setIsSavingTemplate(true);
    try {
      const items = templateItemsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (items.length === 0) {
        setTemplateError('Ajoute au moins une tâche (une par ligne).');
        setIsSavingTemplate(false);
        return;
      }
      await authFetch('/api/hygiene/checklist-templates', {
        method: 'POST',
        body: JSON.stringify({ name: templateName, items }),
      });
      setTemplateName('');
      setTemplateItemsText('');
      setShowTemplateForm(false);
      await loadAll();
    } catch (err) {
      setTemplateError(err instanceof ApiRequestError ? err.message : 'Impossible de créer ce modèle.');
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function handleDeactivateTemplate(id: string) {
    try {
      await authFetch(`/api/hygiene/checklist-templates/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de désactiver ce modèle.');
    }
  }

  // --- Démarrer une checklist ---
  const [startTemplateId, setStartTemplateId] = useState('');
  const [startServiceDate, setStartServiceDate] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  async function handleStartCompletion(e: FormEvent) {
    e.preventDefault();
    setStartError(null);
    setIsStarting(true);
    try {
      const res = await authFetch<{ completion: ChecklistCompletion }>('/api/hygiene/checklist-completions', {
        method: 'POST',
        body: JSON.stringify({ templateId: startTemplateId, serviceDate: startServiceDate }),
      });
      navigate(`/hygiene/completions/${res.completion.id}`);
    } catch (err) {
      setStartError(err instanceof ApiRequestError ? err.message : 'Impossible de démarrer cette checklist.');
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-2xl font-bold tracking-tight mb-6">Hygiène</h2>

      <div className="flex gap-1 mb-6 border-b border-border">
        {(
          [
            ['rappels', 'Rappels et normes'],
            ['checklists', 'Checklists'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`min-h-[44px] px-4 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
              tab === key ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2 mb-4">{error}</p>
      )}
      {isLoading && <p className="text-text-faint">Chargement…</p>}

      {!isLoading && tab === 'rappels' && (
        <>
          {canManage && (
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowItemForm((v) => !v)} className={primaryBtnClass}>
                {showItemForm ? 'Annuler' : '+ Ajouter'}
              </button>
            </div>
          )}

          {showItemForm && (
            <form onSubmit={handleCreateItem} className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6 space-y-4">
              <input
                placeholder="Titre (ex: Lavage des mains)"
                required
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                className={inputClass}
              />
              <textarea
                placeholder="Contenu du rappel"
                required
                rows={4}
                value={itemContent}
                onChange={(e) => setItemContent(e.target.value)}
                className={`${inputClass} min-h-0 py-2`}
              />
              <input
                ref={itemFileRef}
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                className="w-full text-sm text-text-muted file:mr-3 file:py-2.5 file:px-4 file:rounded-card-md file:border-0 file:bg-accent file:text-accent-text file:font-medium file:cursor-pointer hover:file:brightness-105"
              />
              {itemError && (
                <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{itemError}</p>
              )}
              <button type="submit" disabled={isSavingItem} className={`w-full ${primaryBtnClass}`}>
                {isSavingItem ? 'Création…' : 'Créer ce rappel'}
              </button>
            </form>
          )}

          {referenceItems.length === 0 && (
            <div className="bg-surface border border-border rounded-card-lg shadow-card">
              <EmptyState
                title="Aucun rappel pour l'instant"
                description="Ajoutez un premier rappel ou une norme pour l'équipe."
                action={
                  canManage ? (
                    <button onClick={() => setShowItemForm(true)} className={primaryBtnClass}>
                      + Ajouter
                    </button>
                  ) : undefined
                }
              />
            </div>
          )}

          {referenceItems.length > 0 && (
            <ul className="space-y-3">
              {referenceItems.map((item) =>
                editingItemId === item.id ? (
                  <li key={item.id} className="bg-surface border border-border rounded-card-lg shadow-card p-4">
                    <form onSubmit={(e) => handleUpdateItem(e, item.id)} className="space-y-3">
                      <input
                        required
                        value={editItemTitle}
                        onChange={(e) => setEditItemTitle(e.target.value)}
                        className={inputClass}
                      />
                      <textarea
                        required
                        rows={3}
                        value={editItemContent}
                        onChange={(e) => setEditItemContent(e.target.value)}
                        className={`${inputClass} min-h-0 py-2`}
                      />
                      <div className="flex gap-2">
                        <button type="submit" className={`flex-1 ${primaryBtnClass}`}>
                          Enregistrer
                        </button>
                        <button type="button" onClick={() => setEditingItemId(null)} className={`flex-1 ${secondaryBtnClass}`}>
                          Annuler
                        </button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={item.id} className="bg-surface border border-border rounded-card-lg shadow-card p-4">
                    {item.hasMedia && <ReferenceItemThumbnail itemId={item.id} accessToken={accessToken} />}
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-text-muted whitespace-pre-wrap mt-1">{item.content}</p>
                    {canManage && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => startEditItem(item)} className={secondaryBtnClass}>
                          Modifier
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)} className={dangerBtnClass}>
                          Supprimer
                        </button>
                      </div>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}
        </>
      )}

      {!isLoading && tab === 'checklists' && (
        <>
          <div className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6 space-y-4">
            <p className="font-medium">Démarrer une checklist de fin de service</p>
            <form onSubmit={handleStartCompletion} className="space-y-3">
              <select
                required
                value={startTemplateId}
                onChange={(e) => setStartTemplateId(e.target.value)}
                className={inputClass}
              >
                <option value="">Choisir un modèle…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                required
                value={startServiceDate}
                onChange={(e) => setStartServiceDate(e.target.value)}
                className={inputClass}
              />
              {startError && (
                <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{startError}</p>
              )}
              <button type="submit" disabled={isStarting || templates.length === 0} className={`w-full ${primaryBtnClass}`}>
                {isStarting ? 'Démarrage…' : 'Démarrer'}
              </button>
              {templates.length === 0 && (
                <p className="text-sm text-text-faint">
                  Aucun modèle de checklist — {canManage ? 'crées-en un ci-dessous.' : "demande à ton Gérant d'en créer un."}
                </p>
              )}
            </form>
          </div>

          <p className="font-medium mb-2">Checklists récentes</p>

          {completions.length === 0 && (
            <div className="bg-surface border border-border rounded-card-lg shadow-card mb-6">
              <EmptyState
                title="Aucune checklist pour l'instant"
                description="Les checklists démarrées par l'équipe apparaîtront ici."
              />
            </div>
          )}

          {completions.length > 0 && (
            <div className="bg-surface border border-border rounded-card-lg shadow-card overflow-hidden mb-6">
              <div className={`grid ${TABLE_COLS} gap-3 px-5 pb-2.5 pt-4 text-xs font-semibold uppercase tracking-wide text-text-faint`}>
                <span>Modèle</span>
                <span>Date</span>
                <span>Statut</span>
              </div>
              {completions.map((c) => (
                <Link
                  key={c.id}
                  to={`/hygiene/completions/${c.id}`}
                  className={`grid ${TABLE_COLS} gap-3 items-center px-5 py-3.5 border-t border-border hover:bg-surface-hover transition-colors`}
                >
                  <span className="min-w-0">
                    <span className="font-medium truncate block">{c.template.name}</span>
                    <span className="text-xs text-text-faint truncate block mt-0.5">
                      {c.completedBy.firstName} {c.completedBy.lastName}
                    </span>
                  </span>
                  <span className="text-sm text-text-muted tabular-nums">
                    {new Date(`${c.serviceDate}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}
                  </span>
                  <span>
                    <Badge tone={c.completedAt ? 'success' : 'info'}>{c.completedAt ? 'Complétée' : 'En cours'}</Badge>
                  </span>
                </Link>
              ))}
            </div>
          )}

          {canManage && (
            <>
              <div className="flex justify-end mb-4">
                <button onClick={() => setShowTemplateForm((v) => !v)} className={secondaryBtnClass}>
                  {showTemplateForm ? 'Annuler' : '+ Nouveau modèle de checklist'}
                </button>
              </div>

              {showTemplateForm && (
                <form onSubmit={handleCreateTemplate} className="bg-surface border border-border rounded-card-lg shadow-card p-6 mb-6 space-y-4">
                  <input
                    placeholder="Nom du modèle (ex: Fin de service midi)"
                    required
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className={inputClass}
                  />
                  <textarea
                    placeholder={'Une tâche par ligne, ex :\nNettoyer le plan de travail\nVider les poubelles'}
                    required
                    rows={5}
                    value={templateItemsText}
                    onChange={(e) => setTemplateItemsText(e.target.value)}
                    className={`${inputClass} min-h-0 py-2`}
                  />
                  {templateError && (
                    <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-card-md px-3 py-2">{templateError}</p>
                  )}
                  <button type="submit" disabled={isSavingTemplate} className={`w-full ${primaryBtnClass}`}>
                    {isSavingTemplate ? 'Création…' : 'Créer ce modèle'}
                  </button>
                </form>
              )}

              <p className="font-medium mb-2">Modèles actifs</p>
              <ul className="space-y-2">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="bg-surface border border-border rounded-card-lg shadow-card p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{t.name}</p>
                      <p className="text-sm text-text-faint truncate">{t.items.length} tâche(s)</p>
                    </div>
                    <button onClick={() => handleDeactivateTemplate(t.id)} className={`shrink-0 ${dangerBtnClass}`}>
                      Désactiver
                    </button>
                  </li>
                ))}
                {templates.length === 0 && <p className="text-text-faint">Aucun modèle actif.</p>}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
