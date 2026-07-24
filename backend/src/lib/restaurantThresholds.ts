import { prisma } from './prisma';

// Petit helper partagé entre menuItem.controller.ts et
// dashboard.controller.ts : les deux ont besoin des seuils de marge du
// restaurant (configurables, décision 0.6) pour classer les plats en
// vert/orange/rouge.
export async function getRestaurantThresholds(
  restaurantId: string,
): Promise<{ greenThreshold: number; orangeThreshold: number }> {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { marginGreenThreshold: true, marginOrangeThreshold: true },
  });
  return {
    greenThreshold: Number(restaurant.marginGreenThreshold),
    orangeThreshold: Number(restaurant.marginOrangeThreshold),
  };
}
