// ============================================================================
// FoodCFO — Seed de données de test
// ============================================================================
// Objectif : valider que le schéma Prisma (schema.prisma) fonctionne
// réellement avec des données proches du terrain, et fournir un jeu de
// données de démo pour développer le frontend sans attendre le scanner
// de factures (Phase 3).
//
// Scénario : un restaurant fictif "Le Petit Bouchon" (bistrot lyonnais),
// 3 utilisateurs (un par rôle), 4 fournisseurs typiques, 6 produits,
// 3 plats avec fiches techniques complètes, un historique de prix montrant
// une hausse sur le saumon (pour tester la détection automatique), une
// facture déjà validée, une commande en brouillon, une perte déclarée et
// une alerte de marge déjà déclenchée.
//
// Prérequis (à mettre en place à l'étape 1.2 — structure du monorepo) :
//   - variable d'environnement DATABASE_URL pointant vers une base
//     PostgreSQL locale ou de dev
//   - argon2 installé (`npm install argon2`) pour le hash des mots de passe
//   - script "prisma": { "seed": "ts-node prisma/seed.ts" } dans le
//     package.json du backend, pour pouvoir lancer `npx prisma db seed`
//
// À exécuter uniquement après `npx prisma migrate dev` (les migrations
// n'ont pas encore été générées dans cette session — pas d'accès DB ici).
// ============================================================================

import { PrismaClient, UserRole, OrderChannel, ProductUnit, VatRate, Allergen, InvoiceStatus, OrderStatus, WasteReason, MarginAlertType, MarginAlertStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Démarrage du seed FoodCFO...');

  // --------------------------------------------------------------------
  // 1. Restaurant
  // --------------------------------------------------------------------
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Le Petit Bouchon',
      currency: 'EUR',
      timezone: 'Europe/Paris',
      marginGreenThreshold: 70,
      marginOrangeThreshold: 60,
      priceIncreaseAlertThreshold: 10,
    },
  });
  console.log(`✅ Restaurant créé : ${restaurant.name} (${restaurant.id})`);

  // --------------------------------------------------------------------
  // 2. Utilisateurs — un par rôle, mot de passe de test identique pour
  //    faciliter les tests manuels (à ne jamais faire en production).
  // --------------------------------------------------------------------
  const passwordHash = await argon2.hash('MotDePasseTest123!');

  const gerant = await prisma.user.create({
    data: {
      restaurantId: restaurant.id,
      email: 'sophie@lepetitbouchon.fr',
      passwordHash,
      role: UserRole.GERANT,
      firstName: 'Sophie',
      lastName: 'Marchand',
    },
  });

  const cuisine = await prisma.user.create({
    data: {
      restaurantId: restaurant.id,
      email: 'karim@lepetitbouchon.fr',
      passwordHash,
      role: UserRole.CUISINE,
      firstName: 'Karim',
      lastName: 'Haddad',
    },
  });

  await prisma.user.create({
    data: {
      restaurantId: restaurant.id,
      email: 'lea@lepetitbouchon.fr',
      passwordHash,
      role: UserRole.SERVICE,
      firstName: 'Léa',
      lastName: 'Petit',
    },
  });

  console.log('✅ 3 utilisateurs créés (Gérant, Cuisine, Service)');

  // --------------------------------------------------------------------
  // 3. Fournisseurs — 4 profils typiques avec des canaux différents,
  //    représentatifs du contexte métier décrit dans le prompt d'origine.
  // --------------------------------------------------------------------
  const boucherie = await prisma.supplier.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Boucherie Fontaine',
      category: 'Boucherie',
      preferredChannel: OrderChannel.PHONE,
      contactPhone: '04 78 00 00 01',
    },
  });

  const poissonnerie = await prisma.supplier.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Marée Bleue',
      category: 'Poissonnerie',
      preferredChannel: OrderChannel.EMAIL,
      contactEmail: 'commandes@mareebleue.fr',
    },
  });

  const primeur = await prisma.supplier.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Primeur des Halles',
      category: 'Primeur',
      preferredChannel: OrderChannel.WHATSAPP,
      contactPhone: '06 12 34 56 78',
    },
  });

  const grossiste = await prisma.supplier.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Metro Pro',
      category: 'Grossiste',
      preferredChannel: OrderChannel.WEB_PORTAL,
      contactEmail: 'contact@metropro.fr',
    },
  });

  console.log('✅ 4 fournisseurs créés');

  // --------------------------------------------------------------------
  // 4. Produits — avec leur dernier prix connu (currentPriceHT)
  // --------------------------------------------------------------------
  const filetBoeuf = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      supplierId: boucherie.id,
      name: 'Filet de bœuf',
      unit: ProductUnit.KG,
      currentPriceHT: 28.50,
    },
  });

  const pouletFermier = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      supplierId: boucherie.id,
      name: 'Poulet fermier entier',
      unit: ProductUnit.UNITE,
      currentPriceHT: 12.90,
    },
  });

  const saumon = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      supplierId: poissonnerie.id,
      name: 'Saumon frais',
      unit: ProductUnit.KG,
      currentPriceHT: 24.20, // prix après la hausse (voir PriceHistory ci-dessous)
    },
  });

  const pommesDeTerre = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      supplierId: primeur.id,
      name: 'Pommes de terre',
      unit: ProductUnit.KG,
      currentPriceHT: 1.20,
    },
  });

  const oignons = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      supplierId: primeur.id,
      name: 'Oignons',
      unit: ProductUnit.KG,
      currentPriceHT: 0.90,
    },
  });

  const cremeFraiche = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      supplierId: grossiste.id,
      name: 'Crème fraîche',
      unit: ProductUnit.L,
      currentPriceHT: 3.40,
    },
  });

  console.log('✅ 6 produits créés');

  // --------------------------------------------------------------------
  // 5. Historique de prix — le saumon illustre une hausse de 10% pile
  //    sur le seuil d'alerte du restaurant (22.00 → 24.20), pour tester
  //    la détection automatique de hausse de prix (règle métier Phase 3).
  // --------------------------------------------------------------------
  await prisma.priceHistory.create({
    data: {
      productId: saumon.id,
      supplierId: poissonnerie.id,
      priceHT: 22.00,
      recordedAt: new Date('2026-06-15'),
    },
  });

  await prisma.priceHistory.create({
    data: {
      productId: saumon.id,
      supplierId: poissonnerie.id,
      priceHT: 24.20,
      recordedAt: new Date('2026-07-10'),
    },
  });

  await prisma.priceHistory.create({
    data: {
      productId: filetBoeuf.id,
      supplierId: boucherie.id,
      priceHT: 28.50,
      recordedAt: new Date('2026-07-01'),
    },
  });

  console.log('✅ Historique de prix créé (avec hausse détectable sur le saumon)');

  // --------------------------------------------------------------------
  // 6. Plats + fiches techniques
  // --------------------------------------------------------------------
  const filetBoeufPlat = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Filet de bœuf sauce poivre',
      category: 'Plats',
      sellingPriceTTC: 24.90,
      vatRate: VatRate.TAUX_10,
      allergens: [Allergen.LAIT],
    },
  });

  await prisma.recipe.create({
    data: {
      menuItemId: filetBoeufPlat.id,
      ingredients: {
        create: [
          { productId: filetBoeuf.id, quantity: 0.220 }, // 220g de filet
          { productId: cremeFraiche.id, quantity: 0.050 }, // 50ml pour la sauce
        ],
      },
    },
  });

  const saumonPlat = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Saumon grillé, pommes de terre',
      category: 'Plats',
      sellingPriceTTC: 21.50,
      vatRate: VatRate.TAUX_10,
      allergens: [Allergen.POISSON, Allergen.LAIT],
    },
  });

  await prisma.recipe.create({
    data: {
      menuItemId: saumonPlat.id,
      ingredients: {
        create: [
          { productId: saumon.id, quantity: 0.180 }, // 180g de saumon
          { productId: pommesDeTerre.id, quantity: 0.200 },
          { productId: cremeFraiche.id, quantity: 0.030 },
        ],
      },
    },
  });

  const pouletPlat = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Poulet rôti, jus corsé',
      category: 'Plats',
      sellingPriceTTC: 18.90,
      vatRate: VatRate.TAUX_10,
      allergens: [],
    },
  });

  await prisma.recipe.create({
    data: {
      menuItemId: pouletPlat.id,
      ingredients: {
        create: [
          { productId: pouletFermier.id, quantity: 0.500 }, // demi-poulet par portion
          { productId: oignons.id, quantity: 0.080 },
        ],
      },
    },
  });

  console.log('✅ 3 plats créés avec fiches techniques complètes');

  // --------------------------------------------------------------------
  // 7. Facture déjà validée (simulateur du résultat de la Phase 3)
  // --------------------------------------------------------------------
  const invoice = await prisma.invoice.create({
    data: {
      restaurantId: restaurant.id,
      supplierId: poissonnerie.id,
      status: InvoiceStatus.VALIDATED,
      invoiceDate: new Date('2026-07-10'),
      totalAmount: 242.00,
      sourceFileUrl: 'seed/factures/maree-bleue-2026-07-10.pdf',
      lineItems: {
        create: [
          {
            productId: saumon.id,
            rawLabel: 'SAUMON FRAIS NORVEGE ENTIER',
            quantity: 10,
            unitPriceHT: 24.20,
            totalPriceHT: 242.00,
            wasManuallyEdited: false,
          },
        ],
      },
    },
  });
  console.log(`✅ Facture de démo créée (${invoice.id})`);

  // --------------------------------------------------------------------
  // 8. Commande fournisseur en brouillon
  // --------------------------------------------------------------------
  await prisma.order.create({
    data: {
      restaurantId: restaurant.id,
      supplierId: primeur.id,
      status: OrderStatus.DRAFT,
      lineItems: {
        create: [
          { productId: pommesDeTerre.id, suggestedQuantity: 15, quantity: 15 },
          { productId: oignons.id, suggestedQuantity: 8, quantity: 8 },
        ],
      },
    },
  });
  console.log('✅ Commande fournisseur en brouillon créée');

  // --------------------------------------------------------------------
  // 9. Déclaration de perte (Phase 5)
  // --------------------------------------------------------------------
  await prisma.wasteEntry.create({
    data: {
      restaurantId: restaurant.id,
      productId: saumon.id,
      quantity: 1.5,
      estimatedValue: 36.30, // 1.5kg × 24.20€
      reason: WasteReason.PERIME,
      declaredById: cuisine.id,
      declaredAt: new Date('2026-07-18'),
    },
  });
  console.log('✅ Déclaration de perte créée');

  // --------------------------------------------------------------------
  // 10. Alerte de marge déjà déclenchée (illustre la règle métier :
  //     hausse de prix fournisseur > seuil configuré → alerte).
  // --------------------------------------------------------------------
  await prisma.marginAlert.create({
    data: {
      restaurantId: restaurant.id,
      menuItemId: saumonPlat.id,
      type: MarginAlertType.SUPPLIER_PRICE_INCREASE,
      status: MarginAlertStatus.ACTIVE,
      thresholdValue: 10, // seuil configuré du restaurant (%)
      currentValue: 10,   // hausse constatée (%) : (24.20-22.00)/22.00 = 10%
      message:
        "Le prix du saumon frais a augmenté de 10% chez Marée Bleue. La marge du plat \"Saumon grillé, pommes de terre\" doit être vérifiée.",
    },
  });
  console.log('✅ Alerte de marge créée');

  console.log('🌱 Seed terminé avec succès.');
}

main()
  .catch((e) => {
    console.error('❌ Erreur pendant le seed :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
