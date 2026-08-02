// Conversion entre "HH:mm" (ce que l'API reçoit/renvoie) et les colonnes
// Prisma @db.Time (StaffingRequirement, ShiftAssignment) — vérifié
// empiriquement (02/08/2026) que Prisma représente une colonne Postgres
// TIME comme un objet Date calé sur l'epoch 1970-01-01T00:00:00 UTC,
// seules les heures/minutes UTC comptent. Ne jamais utiliser les
// méthodes locales (getHours) sur ces valeurs : le fuseau du serveur
// changerait le résultat, alors que Postgres TIME n'a pas de fuseau.

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeString(value: string): Date {
  const match = TIME_REGEX.exec(value);
  if (!match) {
    throw new Error(`Format d'heure invalide : "${value}" (attendu HH:mm).`);
  }
  return new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2]), 0));
}

export function formatTimeToString(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
