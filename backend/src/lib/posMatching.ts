import type { MenuItem } from '@prisma/client';

// Normalise pour comparer deux libellés sans être sensible à la casse,
// aux accents, ni aux espaces superflus — la caisse et FoodCFO n'ont
// aucune raison d'orthographier un plat exactement de la même façon.
// Décompose (NFD) puis retire les marques diacritiques (bloc Unicode
// U+0300-U+036F) plutôt qu'une regex d'échappement Unicode, pour éviter
// toute ambiguïté d'encodage sur ce fichier.
function normalizeLabel(label: string): string {
  const decomposed = label.normalize('NFD');
  let stripped = '';
  for (const ch of decomposed) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x0300 && code <= 0x036f) continue;
    stripped += ch;
  }
  return stripped.toLowerCase().trim().replace(/\s+/g, ' ');
}

type MatchableMenuItem = Pick<MenuItem, 'id' | 'name'>;

// Rapprochement automatique d'une ligne de vente caisse vers un plat de
// la carte. Politique actée le 04/08/2026 : fiable par défaut (rien à
// revoir si le rapprochement est bon), mais jamais un rapprochement
// hasardeux — en cas d'ambiguïté (aucune correspondance exacte et
// plusieurs correspondances partielles possibles), on renvoie null
// plutôt que de deviner : la ligne attend alors une correction manuelle
// (voir PosSaleLineItem.wasManuallyEdited). Un faux rapprochement
// silencieux serait pire qu'une ligne à revoir.
//
// Appelée au moment de la remontée d'une vente (webhook/polling, pas
// encore construit — dépend du mécanisme de connexion, voir
// FoodCFO_PLAN.md Phase 9) : le résultat est persisté sur
// PosSaleLineItem.menuItemId à la création, pas recalculé à chaque
// lecture.
export function findBestMenuItemMatch(rawLabel: string, menuItems: MatchableMenuItem[]): string | null {
  const normalizedRaw = normalizeLabel(rawLabel);
  if (!normalizedRaw) return null;

  const exactMatch = menuItems.find((item) => normalizeLabel(item.name) === normalizedRaw);
  if (exactMatch) return exactMatch.id;

  // Repli : la caisse ajoute parfois une variante au libellé (ex.
  // "Burger Classic (Menu)" doit quand même retrouver "Burger
  // Classic") — mais seulement si un seul plat correspond, sinon
  // impossible de savoir lequel choisir sans deviner.
  const partialMatches = menuItems.filter((item) => {
    const normalizedName = normalizeLabel(item.name);
    return normalizedName.length > 0 && (normalizedRaw.includes(normalizedName) || normalizedName.includes(normalizedRaw));
  });
  return partialMatches.length === 1 ? partialMatches[0].id : null;
}
