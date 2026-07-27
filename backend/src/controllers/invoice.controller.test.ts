import { describe, it, expect } from 'vitest';
import { filterValidExtractedLines } from './invoice.controller';

// Couvre le bug corrigé cette session : les lignes extraites d'une
// facture par l'IA (uploadInvoice) n'étaient jamais revalidées avant
// d'entrer en base, contrairement à une ligne saisie/éditée à la main
// (POST/PATCH .../lines), qui passe toujours par ce même schéma
// (createInvoiceLineSchema). Testé ici indépendamment d'un vrai appel
// à extractInvoiceData() : aucune clé ANTHROPIC_API_KEY réelle n'existe
// dans cet environnement, ce chemin ne serait jamais exercé sinon.
describe('filterValidExtractedLines', () => {
  it('conserve toutes les lignes valides sans rien rejeter', () => {
    const lines = [
      { rawLabel: 'Filet de bœuf 5kg', quantity: 5, unitPriceHT: 28.5, totalPriceHT: 142.5 },
      { rawLabel: 'Crème fraîche 1L', quantity: 1, unitPriceHT: 3.4, totalPriceHT: 3.4 },
    ];
    const { validLines, rejectedCount } = filterValidExtractedLines(lines);
    expect(validLines).toHaveLength(2);
    expect(rejectedCount).toBe(0);
  });

  it("rejette une ligne au prix négatif (ex: une remise que l'IA interprète comme une ligne produit)", () => {
    const lines = [
      { rawLabel: 'Filet de bœuf 5kg', quantity: 5, unitPriceHT: 28.5, totalPriceHT: 142.5 },
      { rawLabel: 'Remise fidélité', quantity: 1, unitPriceHT: -5, totalPriceHT: -5 },
    ];
    const { validLines, rejectedCount } = filterValidExtractedLines(lines);
    expect(validLines).toHaveLength(1);
    expect(validLines[0].rawLabel).toBe('Filet de bœuf 5kg');
    expect(rejectedCount).toBe(1);
  });

  it('accepte un prix à 0€ (article offert par le fournisseur) — cohérent avec la saisie manuelle', () => {
    const lines = [{ rawLabel: 'Échantillon offert', quantity: 1, unitPriceHT: 0, totalPriceHT: 0 }];
    const { validLines, rejectedCount } = filterValidExtractedLines(lines);
    expect(validLines).toHaveLength(1);
    expect(rejectedCount).toBe(0);
  });

  it('rejette une quantité nulle ou négative', () => {
    const lines = [
      { rawLabel: 'Ligne quantité nulle', quantity: 0, unitPriceHT: 10, totalPriceHT: 0 },
      { rawLabel: 'Ligne quantité négative', quantity: -2, unitPriceHT: 10, totalPriceHT: -20 },
    ];
    const { validLines, rejectedCount } = filterValidExtractedLines(lines);
    expect(validLines).toHaveLength(0);
    expect(rejectedCount).toBe(2);
  });

  it('rejette une ligne sans libellé exploitable', () => {
    const lines = [{ rawLabel: '', quantity: 1, unitPriceHT: 10, totalPriceHT: 10 }];
    const { validLines, rejectedCount } = filterValidExtractedLines(lines);
    expect(validLines).toHaveLength(0);
    expect(rejectedCount).toBe(1);
  });

  it('liste vide → rien à valider, aucun rejet', () => {
    const { validLines, rejectedCount } = filterValidExtractedLines([]);
    expect(validLines).toHaveLength(0);
    expect(rejectedCount).toBe(0);
  });
});
