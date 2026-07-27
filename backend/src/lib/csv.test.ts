import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('sépare les colonnes par point-virgule (locale française) et termine par CRLF', () => {
    const csv = toCsv(['Nom', 'Prix'], [['Filet de bœuf', 28.5]]);
    expect(csv).toContain('Nom;Prix');
    expect(csv).toContain('Filet de bœuf;28.5');
    expect(csv).toContain('\r\n');
  });

  it('commence par un BOM UTF-8 (accents corrects dans Excel Windows)', () => {
    const csv = toCsv(['Nom'], [['Test']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('échappe un champ contenant un point-virgule, des guillemets ou un saut de ligne (RFC 4180)', () => {
    const csv = toCsv(['Nom'], [['Fournisseur "Le Bon"; associé']]);
    expect(csv).toContain('"Fournisseur ""Le Bon""; associé"');
  });

  it("neutralise un champ texte qui ressemblerait à une formule (CSV Injection) — jamais un nombre légitime", () => {
    const csv = toCsv(
      ['Produit', 'Quantité'],
      [
        ['=cmd|\'/c calc\'!A1', 5],
        ['+1+1', 3],
        ['-1+1', 2],
        ['@SUM(A1:A2)', 1],
      ],
    );
    expect(csv).toContain("'=cmd|'/c calc'!A1");
    expect(csv).toContain("'+1+1");
    expect(csv).toContain("'-1+1");
    expect(csv).toContain("'@SUM(A1:A2)");
    // Les quantités numériques légitimes ne doivent jamais être touchées.
    expect(csv).toContain(';5');
    expect(csv).toContain(';3');
  });

  it('ne touche jamais un nombre négatif légitime (pas de risque d’injection sur un `number`)', () => {
    const csv = toCsv(['Écart'], [[-12.5]]);
    expect(csv).toContain('Écart\r\n-12.5');
    expect(csv).not.toContain("'-12.5");
  });

  it('un nom de produit normal (le cas courant) traverse sans modification', () => {
    const csv = toCsv(['Produit'], [['Pommes de terre']]);
    expect(csv).toContain('Pommes de terre');
  });
});
