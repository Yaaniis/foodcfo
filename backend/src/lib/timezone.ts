// Calcule les limites "ce mois-ci" du point de vue du fuseau horaire du
// restaurant (Restaurant.timezone, IANA, ex. "Europe/Paris"), pas du
// serveur (Railway tourne en UTC). Sans ça, jusqu'à 2h autour de minuit
// le 1er du mois (selon heure d'été/hiver française), une facture ou
// une perte pouvait être comptée dans le mauvais mois sur le tableau de
// bord, le rapport mensuel et l'export comptable.

function partsInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// Convertit une date/heure "murale" (telle qu'affichée dans le fuseau
// donné) en l'instant UTC réel correspondant : une première estimation
// traitée comme si elle était déjà en UTC, corrigée par l'écart observé
// une fois cette estimation reformatée dans le fuseau cible. Fiable
// pour "le 1er du mois à minuit" : les transitions heure d'été/hiver
// françaises tombent toujours fin mars/fin octobre, jamais le 1er d'un
// mois, donc jamais sur l'heure ambiguë/inexistante que cette technique
// ne gère pas.
function zonedTimeToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const partsAtGuess = partsInTimezone(new Date(utcGuess), timeZone);
  const guessSeenAsUtc = Date.UTC(
    partsAtGuess.year,
    partsAtGuess.month - 1,
    partsAtGuess.day,
    partsAtGuess.hour,
    partsAtGuess.minute,
    partsAtGuess.second,
  );
  const offsetMs = guessSeenAsUtc - utcGuess;
  return new Date(utcGuess - offsetMs);
}

export function monthRangeInTimezone(
  referenceDate: Date,
  timeZone: string,
): { monthStart: Date; monthEnd: Date; monthLabel: string } {
  const { year, month } = partsInTimezone(referenceDate, timeZone);
  const monthStart = zonedTimeToUtc(year, month, 1, timeZone);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const monthEnd = zonedTimeToUtc(nextMonthYear, nextMonth, 1, timeZone);
  const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
  return { monthStart, monthEnd, monthLabel };
}
