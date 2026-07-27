// Bornes numériques partagées, alignées sur les précisions Decimal
// réellement déclarées dans schema.prisma. Sans elles, un schéma Zod
// (positive()/nonnegative() seuls, sans max()) laisse passer une valeur
// qu'aucune colonne ne peut stocker — l'écriture Prisma échoue alors
// avec une erreur Postgres ("numeric field overflow") non gérée
// spécifiquement par errorHandler.ts, donc un 500 opaque au lieu d'un
// 400 clair (même famille que le bug de la suite 22 sur les fichiers
// trop volumineux). Un restaurateur qui fait une faute de frappe
// tactile sur tablette (chiffre en trop) est le scénario réaliste ici,
// pas une attaque délibérée.

// @db.Decimal(10, 4) — 6 chiffres avant la virgule, 4 après.
// Utilisé pour les quantités et les prix unitaires HT.
export const DECIMAL_10_4_MAX = 999_999.9999;

// @db.Decimal(10, 2) — 8 chiffres avant la virgule, 2 après.
// Utilisé pour les montants (prix de vente, totaux).
export const DECIMAL_10_2_MAX = 99_999_999.99;
