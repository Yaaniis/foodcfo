// File de synchronisation pour la saisie de gaspillage hors-ligne
// (exigence transversale du plan : "consultation marges + saisie
// gaspillage" en mode hors-ligne partiel).
//
// Choix : localStorage plutôt qu'IndexedDB — même logique que
// AuthContext.tsx pour la session, une file de quelques déclarations en
// attente n'a pas besoin d'une base de données côté client. Le cache
// des données consultables hors-ligne (tableau de bord, listes de
// produits/plats), lui, est géré par Workbox (voir vite.config.ts) —
// ce module ne gère que les écritures en attente, jamais les lectures.

const QUEUE_STORAGE_KEY = 'foodcfo_waste_offline_queue';

export interface QueuedWasteEntry {
  localId: string;
  productId?: string;
  menuItemId?: string;
  quantity: number;
  reason: string;
  queuedAt: string;
}

export type NewQueuedWasteEntry = Omit<QueuedWasteEntry, 'localId' | 'queuedAt'>;

function readQueue(): QueuedWasteEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedWasteEntry[]) : [];
  } catch {
    return [];
  }
}

// `localStorage.setItem` peut lever (quota dépassé, navigation privée
// Safari qui restreint drastiquement le quota dès le départ) — sans ce
// try/catch, l'exception remontait brute depuis un event handler React
// (un ErrorBoundary ne rattrape jamais ça, seulement les erreurs de
// rendu) : l'utilisateur cliquait "Déclarer la perte" sans le moindre
// retour visible, la déclaration silencieusement perdue.
function writeQueue(queue: QueuedWasteEntry[]): boolean {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

export function getQueuedWasteEntries(): QueuedWasteEntry[] {
  return readQueue();
}

// Renvoie `null` si l'écriture locale a échoué (au lieu de l'entrée
// créée) — l'appelant doit vérifier ce cas et prévenir l'utilisateur
// plutôt que de croire la déclaration enregistrée à tort.
export function enqueueWasteEntry(entry: NewQueuedWasteEntry): QueuedWasteEntry | null {
  const queued: QueuedWasteEntry = {
    ...entry,
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    queuedAt: new Date().toISOString(),
  };
  const success = writeQueue([...readQueue(), queued]);
  return success ? queued : null;
}

export function removeFromQueue(localId: string): void {
  writeQueue(readQueue().filter((e) => e.localId !== localId));
}

// Rejoue chaque déclaration en attente via `submit` (l'appel API réel,
// fourni par l'appelant pour rester découplé d'apiClient/AuthContext).
// Chaque entrée synchronisée avec succès est retirée de la file ; une
// entrée qui échoue reste en attente — jamais perdue silencieusement.
//
// Essaie bien CHAQUE entrée, sans s'arrêter à la première en échec :
// les déclarations sont indépendantes les unes des autres (rien ne les
// relie), donc une seule bloquée durablement (ex: le produit qu'elle
// référence a été supprimé entre-temps par un collègue — une 404, pas
// une panne réseau temporaire) ne doit jamais empêcher la
// synchronisation des autres, valides.
export async function syncQueuedWasteEntries(
  submit: (entry: QueuedWasteEntry) => Promise<void>,
): Promise<{ synced: number; remaining: number }> {
  const queue = readQueue();
  let synced = 0;

  for (const entry of queue) {
    try {
      await submit(entry);
      removeFromQueue(entry.localId);
      synced += 1;
    } catch {
      // Cette entrée reste en file (retirée uniquement en cas de
      // succès) ; on continue avec la suivante plutôt que d'abandonner
      // toute la file au premier échec.
    }
  }

  return { synced, remaining: readQueue().length };
}
