// Types et schémas partagés entre le backend et le frontend, pour éviter
// la duplication et les désynchronisations de contrat (décision 0.3 :
// monorepo avec workspaces).
//
// ⚠️ Ce fichier ne contient pour l'instant que les constantes stables
// issues des décisions de cadrage (Phase 0). Les DTOs (types
// entrée/sortie) de chaque endpoint seront ajoutés ici au fur et à
// mesure de la Phase 1.3 ("Les endpoints API avec leur contrat"), pour
// que le frontend les importe directement au lieu de les redéfinir.

// Décision 0.5 : 3 rôles simples.
export const USER_ROLES = ['GERANT', 'CUISINE', 'SERVICE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Décision 0.6 : valeurs par défaut des seuils de marge (surchargeables
// par restaurant en base — voir Restaurant.marginGreenThreshold /
// marginOrangeThreshold dans schema.prisma).
export const DEFAULT_MARGIN_THRESHOLDS = {
  green: 70,
  orange: 60,
} as const;
