// Génération de CSV — fonction pure, pas de dépendance externe (un
// export comptable n'a besoin de rien de plus qu'un échappement correct
// des champs). Séparateur `;` plutôt que `,` : Excel en locale française
// (celle du public visé par l'app) utilise la virgule comme séparateur
// décimal et attend `;` comme séparateur de colonnes CSV — un export
// avec `,` s'ouvrirait dans une seule colonne illisible.
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escapeField = (value: string | number): string => {
    let str = String(value);
    // Neutralise l'injection de formule ("CSV Injection", OWASP) : un
    // champ texte commençant par ces caractères serait interprété comme
    // une formule par Excel/LibreOffice à l'ouverture — pertinent ici
    // car les noms de produits/fournisseurs peuvent provenir de
    // l'extraction automatique d'une facture scannée, pas uniquement
    // d'une saisie de confiance. Jamais appliqué à un `number` : par
    // construction, il ne peut contenir aucun caractère arbitraire.
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (/[";\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(';'));
  // BOM UTF-8 en tête : sans lui, Excel Windows interprète les accents
  // français comme du Latin-1 et les affiche mal.
  return '﻿' + lines.join('\r\n');
}
