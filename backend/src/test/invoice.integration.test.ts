import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// L'environnement de test n'a pas de vraie clé ANTHROPIC_API_KEY (voir
// .env.example / journal de bord) : l'extraction automatique échoue
// donc systématiquement ici, ce qui permet justement de vérifier en
// conditions réelles le chemin de repli explicitement demandé par le
// plan ("saisie manuelle assistée si l'extraction échoue").
describe('Factures — upload, repli manuel, validation', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant facture ${label}`,
        gerant: {
          email: `gerant-facture-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string } };
  }

  async function setupSupplierAndProduct(token: string, priceHT: number) {
    const supplier = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Fournisseur Test', category: 'Boucherie', preferredChannel: 'EMAIL' });

    const product = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: supplier.body.supplier.id, name: 'Filet de bœuf', unit: 'KG', currentPriceHT: priceHT });

    return { supplierId: supplier.body.supplier.id as string, productId: product.body.product.id as string };
  }

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('rejette un fichier dont le contenu réel ne correspond à aucun type autorisé (falsification de type)', async () => {
    const restaurant = await bootstrapRestaurant('A');
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .attach('file', Buffer.from('<html>pas une facture</html>'), 'facture.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  it('rejette un fichier trop volumineux avec un message clair (400), pas une erreur générique (500)', async () => {
    const restaurant = await bootstrapRestaurant('A2');
    const oversized = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(16 * 1024 * 1024, 'a')]);
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .attach('file', oversized, 'grosse-facture.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
  });

  it("accepte un PDF valide, bascule en statut ERROR faute de clé API réelle, et permet la saisie manuelle jusqu'à validation", async () => {
    const restaurant = await bootstrapRestaurant('B');
    const { supplierId, productId } = await setupSupplierAndProduct(restaurant.accessToken, 20);

    const uploadRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .field('supplierId', supplierId)
      .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'facture.pdf');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.invoice.status).toBe('ERROR');
    expect(uploadRes.body.invoice.errorMessage).toBeTruthy();
    const invoiceId = uploadRes.body.invoice.id as string;

    // Tant qu'aucune ligne n'est rapprochée d'un produit, la validation
    // doit être refusée.
    const prematureValidate = await request(app)
      .post(`/api/invoices/${invoiceId}/validate`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(prematureValidate.status).toBe(400);
    expect(prematureValidate.body.error).toBe('NO_LINES');

    // Repli : l'utilisateur saisit la ligne manuellement, avec une
    // hausse de prix de 25% (20€ → 25€) — au-dessus du seuil d'alerte
    // par défaut (10%, décision 0.6 côté Restaurant).
    const lineRes = await request(app)
      .post(`/api/invoices/${invoiceId}/lines`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ rawLabel: 'Filet de bœuf 1kg', productId, quantity: 1, unitPriceHT: 25, totalPriceHT: 25 });
    expect(lineRes.status).toBe(201);
    expect(lineRes.body.line.wasManuallyEdited).toBe(true);

    const validateRes = await request(app)
      .post(`/api/invoices/${invoiceId}/validate`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.invoice.status).toBe('VALIDATED');
    expect(validateRes.body.alertsGenerated).toHaveLength(1);
    expect(validateRes.body.alertsGenerated[0].increasePercent).toBeCloseTo(25, 4);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(Number(product.currentPriceHT)).toBe(25);

    const priceHistory = await prisma.priceHistory.findMany({ where: { productId } });
    expect(priceHistory).toHaveLength(1);
    expect(Number(priceHistory[0].priceHT)).toBe(25);

    const alerts = await prisma.marginAlert.findMany({
      where: { restaurantId: restaurant.user.restaurantId, type: 'SUPPLIER_PRICE_INCREASE' },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain('Filet de bœuf');

    // Revalider la même facture (double-clic, requête rejouée) ne doit
    // ni recréer d'historique de prix ni régénérer d'alerte.
    const revalidateRes = await request(app)
      .post(`/api/invoices/${invoiceId}/validate`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(revalidateRes.status).toBe(409);
    expect(revalidateRes.body.error).toBe('ALREADY_VALIDATED');

    const priceHistoryAfterRetry = await prisma.priceHistory.findMany({ where: { productId } });
    expect(priceHistoryAfterRetry).toHaveLength(1);
    const alertsAfterRetry = await prisma.marginAlert.findMany({
      where: { restaurantId: restaurant.user.restaurantId, type: 'SUPPLIER_PRICE_INCREASE' },
    });
    expect(alertsAfterRetry).toHaveLength(1);
  });

  it("ne génère pas d'alerte quand la hausse de prix reste sous le seuil configuré", async () => {
    const restaurant = await bootstrapRestaurant('C');
    const { supplierId, productId } = await setupSupplierAndProduct(restaurant.accessToken, 20);

    const uploadRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .field('supplierId', supplierId)
      .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'facture.pdf');
    const invoiceId = uploadRes.body.invoice.id as string;

    // Hausse de 5%, sous le seuil par défaut de 10%.
    await request(app)
      .post(`/api/invoices/${invoiceId}/lines`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ rawLabel: 'Filet de bœuf 1kg', productId, quantity: 1, unitPriceHT: 21, totalPriceHT: 21 });

    const validateRes = await request(app)
      .post(`/api/invoices/${invoiceId}/validate`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.alertsGenerated).toHaveLength(0);
  });

  it("refuse de valider une facture sans fournisseur associé", async () => {
    const restaurant = await bootstrapRestaurant('D');
    const { productId } = await setupSupplierAndProduct(restaurant.accessToken, 20);

    const uploadRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'facture.pdf');
    const invoiceId = uploadRes.body.invoice.id as string;

    await request(app)
      .post(`/api/invoices/${invoiceId}/lines`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ rawLabel: 'Filet de bœuf 1kg', productId, quantity: 1, unitPriceHT: 21, totalPriceHT: 21 });

    const validateRes = await request(app)
      .post(`/api/invoices/${invoiceId}/validate`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);

    expect(validateRes.status).toBe(400);
    expect(validateRes.body.error).toBe('MISSING_SUPPLIER');
  });

  it('isolation multi-tenant : un restaurant ne peut pas voir la facture d\'un autre', async () => {
    const restaurantA = await bootstrapRestaurant('E');
    const restaurantB = await bootstrapRestaurant('F');

    const uploadRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .attach('file', Buffer.from('%PDF-1.4\ncontenu factice'), 'facture.pdf');
    const invoiceId = uploadRes.body.invoice.id as string;

    const getRes = await request(app)
      .get(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);

    expect(getRes.status).toBe(404);
  });

  it('le fichier source survient au cycle complet upload → récupération (stocké en base, pas sur disque), et reste absent des réponses liste/détail', async () => {
    const restaurant = await bootstrapRestaurant('H');
    const originalBytes = Buffer.from('%PDF-1.4\ncontenu factice pour vérifier les octets exacts');

    const uploadRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .attach('file', originalBytes, 'facture.pdf');
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.invoice.sourceFileData).toBeUndefined();
    const invoiceId = uploadRes.body.invoice.id as string;

    const fileRes = await request(app)
      .get(`/api/invoices/${invoiceId}/file`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .responseType('blob');
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toBe('application/pdf');
    expect(Buffer.compare(Buffer.from(fileRes.body as Buffer), originalBytes)).toBe(0);

    const listRes = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(listRes.body.invoices[0].sourceFileData).toBeUndefined();

    const getRes = await request(app)
      .get(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(getRes.body.invoice.sourceFileData).toBeUndefined();
  });

  it('le rôle Service ne peut pas accéder aux factures (décision 0.5)', async () => {
    const restaurant = await bootstrapRestaurant('G');
    const serviceUser = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({
        email: `service-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Service',
        lastName: 'Test',
        role: 'SERVICE',
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: `service-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });
    void serviceUser;

    const listRes = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(listRes.status).toBe(403);
  });
});
