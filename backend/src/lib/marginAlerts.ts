import type { Prisma } from '@prisma/client';
import { getRestaurantThresholds } from './restaurantThresholds';
import { computeMenuItemMargin } from './margin';

// Génère/résout les alertes MARGIN_BELOW_THRESHOLD (schéma Prisma prévu
// dès la Phase 3 — status ACTIVE/RESOLVED/DISMISSED, index dédié "pour
// le tableau de bord" — mais jamais déclenché nulle part avant ce
// correctif). Appelé aux trois points où la marge d'un plat peut
// changer : validation de facture (coût matière), modification du prix
// de vente/TVA, modification de la fiche technique.
//
// Accepte un client Prisma générique (transaction ou non) : appelé
// depuis l'intérieur du $transaction existant de validateInvoice, et
// depuis updateMenuItem/upsertRecipe qui n'en ont pas.
export async function checkMarginAlertsForMenuItems(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  menuItemIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(menuItemIds)];
  if (uniqueIds.length === 0) return;

  const thresholds = await getRestaurantThresholds(restaurantId);

  const menuItems = await tx.menuItem.findMany({
    where: { id: { in: uniqueIds }, restaurantId, isActive: true },
    include: { recipe: { include: { ingredients: { include: { product: true } } } } },
  });

  for (const menuItem of menuItems) {
    const margin = computeMenuItemMargin(menuItem, thresholds);

    const existingAlert = await tx.marginAlert.findFirst({
      where: { restaurantId, menuItemId: menuItem.id, type: 'MARGIN_BELOW_THRESHOLD', status: 'ACTIVE' },
    });

    if (margin && margin.status === 'RED') {
      const message = `La marge de "${menuItem.name}" est passée sous le seuil rouge (${margin.marginRatio.toFixed(1)} %, seuil : ${thresholds.orangeThreshold} %).`;
      if (existingAlert) {
        // Déjà une alerte active pour ce plat : on rafraîchit la valeur
        // plutôt que d'en créer une seconde (éviter le doublon/spam à
        // chaque nouvelle facture tant que le problème n'est pas réglé).
        await tx.marginAlert.update({
          where: { id: existingAlert.id },
          data: { currentValue: margin.marginRatio, message },
        });
      } else {
        await tx.marginAlert.create({
          data: {
            restaurantId,
            menuItemId: menuItem.id,
            type: 'MARGIN_BELOW_THRESHOLD',
            thresholdValue: thresholds.orangeThreshold,
            currentValue: margin.marginRatio,
            message,
          },
        });
      }
    } else if (existingAlert) {
      // La marge est remontée au-dessus du seuil rouge (ou la fiche
      // technique a été supprimée) : la condition qui a déclenché
      // l'alerte n'existe plus, elle se résout d'elle-même plutôt que
      // de rester active indéfiniment après que le Gérant a corrigé le
      // prix ou la recette.
      await tx.marginAlert.update({
        where: { id: existingAlert.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
    }
  }
}

// Variante pratique pour les appelants qui connaissent des productId
// (invoice.controller.ts) plutôt que des menuItemId directement : trouve
// tous les plats dont la fiche technique référence au moins un de ces
// produits.
export async function menuItemIdsUsingProducts(
  tx: Prisma.TransactionClient,
  productIds: string[],
): Promise<string[]> {
  if (productIds.length === 0) return [];
  const links = await tx.recipeIngredient.findMany({
    where: { productId: { in: productIds } },
    select: { recipe: { select: { menuItemId: true } } },
  });
  return [...new Set(links.map((l) => l.recipe.menuItemId))];
}
