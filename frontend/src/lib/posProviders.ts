// Doit rester synchronisé avec l'enum PosProvider du backend
// (schema.prisma / pos.schemas.ts) — les 5 systèmes de caisse tranchés
// le 04/08/2026 après recherche du marché français réel. Partagé entre
// PosPage.tsx (connexion) et PosSalesPage.tsx (rapprochement) plutôt que
// dupliqué : les deux doivent toujours désigner exactement les mêmes 5
// valeurs que le backend accepte.
export const POS_PROVIDERS = [
  { value: 'LIGHTSPEED', label: 'Lightspeed' },
  { value: 'LADDITION', label: "L'Addition" },
  { value: 'ZELTY', label: 'Zelty' },
  { value: 'INNOVORDER', label: 'Innovorder' },
  { value: 'CLYO_SYSTEMS', label: 'Clyo Systems' },
] as const;

export function posProviderLabel(value: string): string {
  return POS_PROVIDERS.find((p) => p.value === value)?.label ?? value;
}
