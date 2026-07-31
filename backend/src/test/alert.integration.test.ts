import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// MarginAlert existait déjà en base depuis la Phase 3 (status
// ACTIVE/RESOLVED/DISMISSED, index dédié "pour le tableau de bord"),
// mais le type MARGIN_BELOW_THRESHOLD n'était jamais généré nulle part
// et aucune route ne permettait de consulter les alertes après coup
// (seul un message ponctuel juste après validation d'une facture). Ces
// tests couvrent la génération (facture/prix de vente/recette) et la
// consultation/résolution.
describe('Alertes de marge — génération et consultation', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant alertes ${label}`,
        gerant: {
          email: `gerant-alertes-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  async function setupMenuItemWithRecipe(token: string, priceHT: number, sellingPriceTTC: number) {
    const supplier = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Fournisseur Test', category: 'Boucherie', preferredChannel: 'EMAIL' });

    const product = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: supplier.body.supplier.id, name: 'Filet de bœuf', unit: 'KG', currentPriceHT: priceHT });
    const productId = product.body.product.id as string;

    const menuItem = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tartare', category: 'Plats', sellingPriceTTC, vatRate: 'TAUX_10', allergens: [] });
    const menuItemId = menuItem.body.menuItem.id as string;

    await request(app)
      .put(`/api/menu-items/${menuItemId}/recipe`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ingredients: [{ productId, quantity: 1 }] });

    return { supplierId: supplier.body.supplier.id as string, productId, menuItemId };
  }

  afterAll(async () => {
    // RecipeIngredient.productId est en onDelete: Restrict (schema.prisma) :
    // supprimer directement les restaurants laisserait la base choisir
    // l'ordre de cascade, qui peut tenter de supprimer un Product encore
    // référencé par une RecipeIngredient avant sa propre suppression en
    // cascade — ce test est le premier de la suite à créer une vraie
    // fiche technique avec un vrai ingrédient (les autres tests qui
    // touchent aux recettes vérifient un rejet 400, sans jamais créer la
    // ligne). Même ordre que deleteRestaurant (restaurant.controller.ts) :
    // MenuItem d'abord (cascade → Recipe → RecipeIngredient), Product ensuite.
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it("génère une alerte MARGIN_BELOW_THRESHOLD quand une facture fait passer un plat sous le seuil rouge, sans doublon si toujours rouge, et la résout automatiquement quand la marge remonte", async () => {
    const restaurant = await bootstrapRestaurant('A');
    // 1kg à 2€ pour un plat vendu 10€ TTC : coût 2€, marge ≈ 80% → vert au départ.
    const { supplierId, productId, menuItemId } = await setupMenuItemWithRecipe(restaurant.accessToken, 2, 10);

    async function validateInvoiceAtPrice(unitPriceHT: number) {
      const upload = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .field('supplierId', supplierId)
        .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'facture.pdf');
      const invoiceId = upload.body.invoice.id as string;
      await request(app)
        .post(`/api/invoices/${invoiceId}/lines`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`)
        .send({ rawLabel: 'Filet de bœuf 1kg', productId, quantity: 1, unitPriceHT, totalPriceHT: unitPriceHT });
      return request(app)
        .post(`/api/invoices/${invoiceId}/validate`)
        .set('Authorization', `Bearer ${restaurant.accessToken}`);
    }

    // 8€/kg pour un coût matière de 8€ sur un plat à 10€ TTC : marge 20% → rouge.
    await validateInvoiceAtPrice(8);

    const alertsAfterFirst = await prisma.marginAlert.findMany({
      where: { restaurantId: restaurant.user.restaurantId, type: 'MARGIN_BELOW_THRESHOLD' },
    });
    expect(alertsAfterFirst).toHaveLength(1);
    expect(alertsAfterFirst[0].status).toBe('ACTIVE');
    expect(alertsAfterFirst[0].menuItemId).toBe(menuItemId);
    expect(alertsAfterFirst[0].message).toContain('Tartare');

    // Une deuxième facture qui garde le plat en rouge (8,50€/kg) ne doit
    // pas créer de deuxième alerte active, seulement rafraîchir la valeur.
    await validateInvoiceAtPrice(8.5);
    const alertsAfterSecond = await prisma.marginAlert.findMany({
      where: { restaurantId: restaurant.user.restaurantId, type: 'MARGIN_BELOW_THRESHOLD' },
    });
    expect(alertsAfterSecond).toHaveLength(1);
    expect(Number(alertsAfterSecond[0].currentValue)).toBeCloseTo(15, 4);

    // Une facture qui fait chuter le prix (1€/kg) ramène la marge à 90% :
    // l'alerte doit se résoudre d'elle-même.
    await validateInvoiceAtPrice(1);
    const alertAfterRecovery = await prisma.marginAlert.findUniqueOrThrow({
      where: { id: alertsAfterFirst[0].id },
    });
    expect(alertAfterRecovery.status).toBe('RESOLVED');
    expect(alertAfterRecovery.resolvedAt).not.toBeNull();
  });

  it('génère une alerte quand le prix de vente est baissé sous le seuil rouge, quand la fiche technique est modifiée en conséquence, et quand le prix d’achat du produit est corrigé manuellement', async () => {
    const restaurant = await bootstrapRestaurant('B');
    const { menuItemId, productId } = await setupMenuItemWithRecipe(restaurant.accessToken, 2, 10);

    // Aucune alerte au départ (plat vert : coût 2€ sur prix de vente 10€).
    const alertsInitial = await prisma.marginAlert.findMany({ where: { menuItemId } });
    expect(alertsInitial).toHaveLength(0);

    // Le Gérant baisse le prix de vente à 2,50€ TTC : coût 2€ pour un prix
    // de 2,50€, marge 20% → rouge.
    const updateRes = await request(app)
      .patch(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ sellingPriceTTC: 2.5 });
    expect(updateRes.status).toBe(200);

    const alertsAfterPriceCut = await prisma.marginAlert.findMany({
      where: { menuItemId, type: 'MARGIN_BELOW_THRESHOLD', status: 'ACTIVE' },
    });
    expect(alertsAfterPriceCut).toHaveLength(1);

    // Remettre un prix de vente correct (10€) résout l'alerte automatiquement.
    await request(app)
      .patch(`/api/menu-items/${menuItemId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ sellingPriceTTC: 10 });
    const alertsAfterFix = await prisma.marginAlert.findMany({
      where: { menuItemId, type: 'MARGIN_BELOW_THRESHOLD', status: 'ACTIVE' },
    });
    expect(alertsAfterFix).toHaveLength(0);

    // Une recette qui augmente fortement la quantité d'ingrédient repousse
    // le plat en rouge (10kg à 2€ = 20€ de coût pour 10€ de prix de vente).
    await request(app)
      .put(`/api/menu-items/${menuItemId}/recipe`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ ingredients: [{ productId, quantity: 10 }] });
    const alertsAfterRecipeChange = await prisma.marginAlert.findMany({
      where: { menuItemId, type: 'MARGIN_BELOW_THRESHOLD', status: 'ACTIVE' },
    });
    expect(alertsAfterRecipeChange).toHaveLength(1);

    // Revenir à une quantité saine (1kg) résout l'alerte : marge repassée
    // au vert (coût 2€ pour 10€ de prix de vente).
    await request(app)
      .put(`/api/menu-items/${menuItemId}/recipe`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ ingredients: [{ productId, quantity: 1 }] });
    expect(
      await prisma.marginAlert.count({ where: { menuItemId, type: 'MARGIN_BELOW_THRESHOLD', status: 'ACTIVE' } }),
    ).toBe(0);

    // Une correction manuelle du prix d'achat du produit (pas via une
    // facture) doit aussi être prise en compte : 12€/kg pour 1kg dans la
    // recette = 12€ de coût pour 10€ de prix de vente → rouge.
    const productPriceRes = await request(app)
      .patch(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ currentPriceHT: 12 });
    expect(productPriceRes.status).toBe(200);
    expect(
      await prisma.marginAlert.count({ where: { menuItemId, type: 'MARGIN_BELOW_THRESHOLD', status: 'ACTIVE' } }),
    ).toBe(1);
  });

  it('resserrer les seuils de marge fait basculer un plat orange en rouge (alerte générée), et les relâcher la résout automatiquement', async () => {
    const restaurant = await bootstrapRestaurant('E');
    // 1kg à 3,50€ pour un plat à 10€ TTC : coût 3,50€, marge 65% → orange
    // par défaut (vert ≥ 70 %, orange 60-70 %), donc aucune alerte au départ.
    const { menuItemId } = await setupMenuItemWithRecipe(restaurant.accessToken, 3.5, 10);
    expect(
      await prisma.marginAlert.count({ where: { menuItemId, type: 'MARGIN_BELOW_THRESHOLD', status: 'ACTIVE' } }),
    ).toBe(0);

    // Resserrer les seuils (vert 90 %, orange 70 %) fait passer 65 % sous
    // le nouveau seuil orange → rouge, sans qu'aucun prix n'ait changé.
    const tightenRes = await request(app)
      .patch('/api/restaurants/me/thresholds')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ marginGreenThreshold: 90, marginOrangeThreshold: 70 });
    expect(tightenRes.status).toBe(200);
    expect(
      await prisma.marginAlert.count({ where: { menuItemId, type: 'MARGIN_BELOW_THRESHOLD', status: 'ACTIVE' } }),
    ).toBe(1);

    // Relâcher les seuils aux valeurs par défaut résout l'alerte
    // automatiquement : 65 % redevient acceptable (orange, pas rouge).
    const loosenRes = await request(app)
      .patch('/api/restaurants/me/thresholds')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ marginGreenThreshold: 70, marginOrangeThreshold: 60 });
    expect(loosenRes.status).toBe(200);
    expect(
      await prisma.marginAlert.count({ where: { menuItemId, type: 'MARGIN_BELOW_THRESHOLD', status: 'ACTIVE' } }),
    ).toBe(0);
  });

  it('GET /api/alerts respecte l’isolation multi-tenant, PATCH permet de résoudre/ignorer, 404/409 gérés, rôle Service refusé', async () => {
    const restaurantA = await bootstrapRestaurant('C');
    const restaurantB = await bootstrapRestaurant('D');
    await setupMenuItemWithRecipe(restaurantA.accessToken, 8, 10); // rouge dès la création (marge 20%)

    const alertA = await prisma.marginAlert.findFirstOrThrow({
      where: { restaurantId: restaurantA.user.restaurantId, type: 'MARGIN_BELOW_THRESHOLD' },
    });

    // Restaurant B ne voit aucune alerte de A.
    const listB = await request(app).get('/api/alerts').set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body.alerts).toHaveLength(0);

    // Restaurant B ne peut pas résoudre une alerte de A (404, pas une fuite d'existence).
    const foreignPatch = await request(app)
      .patch(`/api/alerts/${alertA.id}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`)
      .send({ status: 'RESOLVED' });
    expect(foreignPatch.status).toBe(404);

    // Restaurant A voit bien son alerte.
    const listA = await request(app).get('/api/alerts').set('Authorization', `Bearer ${restaurantA.accessToken}`);
    expect(listA.status).toBe(200);
    expect(listA.body.alerts).toHaveLength(1);
    expect(listA.body.alerts[0].menuItem.name).toBe('Tartare');

    // Résolution par le propriétaire légitime.
    const resolve = await request(app)
      .patch(`/api/alerts/${alertA.id}`)
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ status: 'RESOLVED' });
    expect(resolve.status).toBe(200);
    expect(resolve.body.alert.status).toBe('RESOLVED');

    // Retraiter une alerte déjà traitée est un conflit, pas un succès silencieux.
    const doubleResolve = await request(app)
      .patch(`/api/alerts/${alertA.id}`)
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ status: 'DISMISSED' });
    expect(doubleResolve.status).toBe(409);
    expect(doubleResolve.body.error).toBe('ALREADY_HANDLED');

    // Alerte inexistante.
    const notFound = await request(app)
      .patch('/api/alerts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ status: 'RESOLVED' });
    expect(notFound.status).toBe(404);

    // Décision 0.5 : la marge est une donnée de pilotage financier interne,
    // masquée au Service comme sur /api/dashboard et /api/menu-items.
    const serviceUser = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({
        email: `service-alertes-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Serveur',
        lastName: 'Test',
        role: 'SERVICE',
      });
    const serviceLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: serviceUser.body.user.email, password: 'MotDePasseTest123!' });

    const serviceList = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${serviceLogin.body.accessToken}`);
    expect(serviceList.status).toBe(403);
  });
});
