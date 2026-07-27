import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/apiClient';

interface OrderLine {
  id: string;
  quantity: string;
  product: { id: string; name: string; unit: string };
}

interface OrderDetail {
  id: string;
  status: 'DRAFT' | 'SENT' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
  supplier: {
    id: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    preferredChannel: string;
  };
  lineItems: OrderLine[];
  sentAt: string | null;
  confirmedAt: string | null;
  deliveredAt: string | null;
}

const UNIT_LABELS: Record<string, string> = { KG: 'kg', G: 'g', L: 'L', ML: 'mL', UNITE: 'unité(s)' };

// Le canal réellement utilisé pour l'envoi automatique dépend de
// Supplier.preferredChannel — jamais forcément EMAIL. Sans ce mapping,
// le message de confirmation affichait "envoyée par email" même pour
// un envoi WhatsApp/SMS réussi, avec le champ email vide en prime.
function sentViaLabel(supplier: OrderDetail['supplier']): string {
  switch (supplier.preferredChannel) {
    case 'WHATSAPP':
      return `Commande envoyée par WhatsApp à ${supplier.contactPhone}.`;
    case 'SMS':
      return `Commande envoyée par SMS à ${supplier.contactPhone}.`;
    case 'EMAIL':
      return `Commande envoyée par email à ${supplier.contactEmail}.`;
    default:
      return 'Commande envoyée.';
  }
}

const STATUS_LABELS: Record<OrderDetail['status'], string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  CONFIRMED: 'Confirmée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { authFetch } = useAuth();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState<{ subject: string; text: string } | null>(null);
  const [sendOutcome, setSendOutcome] = useState<'success' | 'failed' | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await authFetch<{ order: OrderDetail }>(`/api/orders/${orderId}`);
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de charger la commande.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function handleSend() {
    setError(null);
    setIsSending(true);
    setSendOutcome(null);
    try {
      const res = await authFetch<{ order: OrderDetail; generatedMessage: { subject: string; text: string } }>(
        `/api/orders/${orderId}/send`,
        { method: 'POST' },
      );
      setOrder(res.order);
      setGeneratedMessage(res.generatedMessage);
      setSendOutcome('success');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const generated = err.body?.generatedMessage as { subject: string; text: string } | undefined;
        if (generated) {
          setGeneratedMessage(generated);
          setSendOutcome('failed');
        }
        setError(err.message);
      } else {
        setError("Impossible d'envoyer la commande.");
      }
    } finally {
      setIsSending(false);
    }
  }

  async function handleStatusChange(status: 'CONFIRMED' | 'DELIVERED' | 'CANCELLED') {
    setError(null);
    setIsUpdatingStatus(true);
    try {
      const res = await authFetch<{ order: OrderDetail }>(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setOrder(res.order);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Impossible de mettre à jour le statut.');
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function handleCopyMessage() {
    if (!generatedMessage) return;
    try {
      await navigator.clipboard.writeText(generatedMessage.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible (permissions refusées, contexte non
      // sécurisé) — sans ce try/catch, la promesse rejetée était
      // silencieuse : le bouton ne réagissait pas du tout, sans le
      // moindre indice pour l'utilisateur.
      setError('Impossible de copier automatiquement. Sélectionnez le texte manuellement.');
    }
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Chargement…</div>;
  }
  if (!order) {
    // error distingue une vraie erreur réseau/serveur (souvent
    // temporaire — wifi cuisine peu fiable) d'une commande réellement
    // introuvable — sans ça, une simple coupure réseau affichait le
    // même message qu'une suppression, sans jamais proposer de réessayer.
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-red-600">{error ?? 'Commande introuvable.'}</p>
        <button onClick={() => load()} className="min-h-[44px] px-4 rounded-lg border border-slate-300 font-medium">
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/orders" className="text-sm text-slate-500 underline">
          ← Retour aux commandes
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-1">{order.supplier.name}</h1>
        <p className="text-slate-500 mb-4">{STATUS_LABELS[order.status]}</p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        {sendOutcome === 'success' && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
            {sentViaLabel(order.supplier)}
          </p>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
          <p className="text-sm font-medium text-slate-700 mb-3">Lignes</p>
          <ul className="space-y-2">
            {order.lineItems.map((line) => (
              <li key={line.id} className="flex justify-between text-sm">
                <span className="text-slate-700">{line.product.name}</span>
                <span className="text-slate-500">
                  {Number(line.quantity)} {UNIT_LABELS[line.product.unit]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {generatedMessage && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-700">
                {sendOutcome === 'failed'
                  ? "Envoi automatique indisponible — message à envoyer manuellement"
                  : 'Message envoyé'}
              </p>
              <button onClick={handleCopyMessage} className="text-sm text-slate-500 underline">
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <pre className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">
              {generatedMessage.text}
            </pre>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {order.status === 'DRAFT' && (
            <>
              <button
                onClick={handleSend}
                disabled={isSending}
                className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
              >
                {isSending ? 'Envoi…' : 'Envoyer la commande'}
              </button>
              <button
                onClick={() => handleStatusChange('CANCELLED')}
                disabled={isUpdatingStatus}
                className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 font-medium disabled:opacity-50"
              >
                Annuler la commande
              </button>
            </>
          )}
          {order.status === 'SENT' && (
            <>
              <button
                onClick={() => handleStatusChange('CONFIRMED')}
                disabled={isUpdatingStatus}
                className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
              >
                Marquer confirmée
              </button>
              <button
                onClick={() => handleStatusChange('DELIVERED')}
                disabled={isUpdatingStatus}
                className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 font-medium disabled:opacity-50"
              >
                Marquer livrée
              </button>
              <button
                onClick={() => handleStatusChange('CANCELLED')}
                disabled={isUpdatingStatus}
                className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 font-medium disabled:opacity-50"
              >
                Annuler
              </button>
            </>
          )}
          {order.status === 'CONFIRMED' && (
            <button
              onClick={() => handleStatusChange('DELIVERED')}
              disabled={isUpdatingStatus}
              className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
            >
              Marquer livrée
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
