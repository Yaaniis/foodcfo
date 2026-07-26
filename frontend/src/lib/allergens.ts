// Liste réglementaire des 14 allergènes UE (décision de modélisation,
// voir schema.prisma) — partagée entre MenuPage (création) et
// RecipePage (modification), pour ne pas la dupliquer.
export const ALLERGENS = [
  'GLUTEN',
  'CRUSTACES',
  'OEUFS',
  'POISSON',
  'ARACHIDES',
  'SOJA',
  'LAIT',
  'FRUITS_A_COQUE',
  'CELERI',
  'MOUTARDE',
  'SESAME',
  'SULFITES',
  'LUPIN',
  'MOLLUSQUES',
] as const;

export const ALLERGEN_LABELS: Record<string, string> = {
  GLUTEN: 'Gluten',
  CRUSTACES: 'Crustacés',
  OEUFS: 'Œufs',
  POISSON: 'Poisson',
  ARACHIDES: 'Arachides',
  SOJA: 'Soja',
  LAIT: 'Lait',
  FRUITS_A_COQUE: 'Fruits à coque',
  CELERI: 'Céleri',
  MOUTARDE: 'Moutarde',
  SESAME: 'Sésame',
  SULFITES: 'Sulfites',
  LUPIN: 'Lupin',
  MOLLUSQUES: 'Mollusques',
};
