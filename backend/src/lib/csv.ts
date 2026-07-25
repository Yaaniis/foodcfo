// Génération de CSV — fonction pure, pas de dépendance externe (un
// export comptable n'a besoin de rien de plus qu'un échappement correct
// des champs). Séparateur `;` plutôt que `,` : Excel en locale française
// (celle du public visé par l'app) utilise la virgule comme séparateur
// décimal et attend `;` comme séparateur de colonnes CSV — un export
// avec `,` s'ouvrirait dans une seule colonne illisible.
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escapeField = (value: string | number): string => {
    const str = String(value);
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
