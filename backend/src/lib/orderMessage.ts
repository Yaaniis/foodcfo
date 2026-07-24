// Génère le message de commande envoyé à un fournisseur — texte simple,
// lisible tel quel (email, ou copié-collé pour un envoi manuel par
// téléphone/SMS/WhatsApp si le canal préféré du fournisseur n'est pas
// l'email, voir Supplier.preferredChannel).

const UNIT_LABELS: Record<string, string> = {
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'mL',
  UNITE: 'unité(s)',
};

export interface OrderMessageLine {
  productName: string;
  quantity: number;
  unit: string;
}

export interface OrderMessage {
  subject: string;
  text: string;
}

export function buildOrderMessage(restaurantName: string, lines: OrderMessageLine[]): OrderMessage {
  const subject = `Commande — ${restaurantName}`;
  const body = lines.map((l) => `- ${l.productName} : ${l.quantity} ${UNIT_LABELS[l.unit] ?? l.unit}`).join('\n');
  const text = [
    'Bonjour,',
    '',
    `Merci de bien vouloir préparer la commande suivante pour ${restaurantName} :`,
    '',
    body,
    '',
    'Merci de confirmer la bonne réception de cette commande.',
    '',
    'Cordialement,',
    restaurantName,
  ].join('\n');

  return { subject, text };
}
