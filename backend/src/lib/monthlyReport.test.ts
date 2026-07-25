import { describe, it, expect } from 'vitest';
import { buildMonthlyReportEmail, type MonthlyReportData } from './monthlyReport';

const BASE_DATA: MonthlyReportData = {
  restaurantName: 'Le Bistrot Test',
  month: '2026-07',
  averageMarginRatio: 73.8,
  greenCount: 4,
  orangeCount: 1,
  redCount: 0,
  potentialSavings: 12.5,
  wasteTotal: 42.3,
  invoiceCount: 3,
  invoiceTotal: 512.4,
};

describe('buildMonthlyReportEmail', () => {
  it('inclut le nom du restaurant et le mois dans le sujet', () => {
    const { subject } = buildMonthlyReportEmail(BASE_DATA);
    expect(subject).toContain('Le Bistrot Test');
    expect(subject).toContain('2026-07');
  });

  it('additionne les plats orange et rouge pour le compteur "en alerte"', () => {
    const { text } = buildMonthlyReportEmail({ ...BASE_DATA, orangeCount: 2, redCount: 3 });
    expect(text).toContain('Plats en alerte (orange ou rouge) : 5');
  });

  it("indique explicitement quand la marge moyenne n'est pas calculable", () => {
    const { text } = buildMonthlyReportEmail({ ...BASE_DATA, averageMarginRatio: null });
    expect(text).toContain('non calculable');
  });

  it('affiche les montants de gaspillage et de factures formatés en euros', () => {
    const { text } = buildMonthlyReportEmail(BASE_DATA);
    expect(text).toContain('42.30 €');
    expect(text).toContain('3 facture(s) validée(s), pour un total de 512.40 €');
  });
});
