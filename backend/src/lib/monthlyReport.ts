// Génère le contenu du rapport mensuel — fonction pure (aucun accès
// base de données), séparée du contrôleur pour rester testable
// facilement, comme buildOrderMessage (Phase 4).

export interface MonthlyReportData {
  restaurantName: string;
  month: string; // "2026-07"
  averageMarginRatio: number | null;
  greenCount: number;
  orangeCount: number;
  redCount: number;
  potentialSavings: number;
  wasteTotal: number;
  invoiceCount: number;
  invoiceTotal: number;
}

export interface ReportEmail {
  subject: string;
  text: string;
}

export function buildMonthlyReportEmail(data: MonthlyReportData): ReportEmail {
  const subject = `Rapport mensuel FoodCFO — ${data.restaurantName} (${data.month})`;

  const text = [
    'Bonjour,',
    '',
    `Voici le récapitulatif du mois de ${data.month} pour ${data.restaurantName} :`,
    '',
    'Santé des marges',
    `- Marge moyenne : ${data.averageMarginRatio !== null ? `${data.averageMarginRatio.toFixed(1)} %` : 'non calculable (aucune fiche technique renseignée)'}`,
    `- Plats en bonne santé : ${data.greenCount}`,
    `- Plats en alerte (orange ou rouge) : ${data.orangeCount + data.redCount}`,
    `- Économies potentielles identifiées : ${data.potentialSavings.toFixed(2)} €`,
    '',
    'Gaspillage',
    `- Impact chiffré du mois : ${data.wasteTotal.toFixed(2)} €`,
    '',
    'Achats fournisseurs',
    `- ${data.invoiceCount} facture(s) validée(s), pour un total de ${data.invoiceTotal.toFixed(2)} €`,
    '',
    'Cordialement,',
    'FoodCFO',
  ].join('\n');

  return { subject, text };
}
