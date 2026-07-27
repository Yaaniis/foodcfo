import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../utils/password';

// Couvre le chantier "vue consolidée multi-restaurants" (Phase 6+,
// initialement reporté, repris sur demande explicite le 25/07/2026) :
// un même Gérant (même email, même mot de passe) peut désormais gérer
// plusieurs restaurants, avec un sélecteur à la connexion et un
// switcher une fois connecté.
describe('Multi-restaurant — ajout, connexion, switch, vue consolidée', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string, email?: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant multi ${label}`,
        gerant: {
          email: email ?? `gerant-multi-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { restaurantId: string; email: string } };
  }

  afterAll(async () => {
    await prisma.wasteEntry.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: createdRestaurantIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it("un compte à un seul restaurant se connecte exactement comme avant (rétrocompatibilité)", async () => {
    const email = `gerant-multi-${suffix}-solo@test-foodcfo.local`;
    await bootstrapRestaurant('Solo', email);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'MotDePasseTest123!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.requiresRestaurantSelection).toBeUndefined();
  });

  it('ajoute un deuxième restaurant au compte, avec le même email, sans redemander de mot de passe', async () => {
    const restaurantA = await bootstrapRestaurant('A');

    const res = await request(app)
      .post('/api/restaurants/add')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ restaurantName: 'Restaurant multi A2' });
    createdRestaurantIds.push(res.body.user.restaurantId);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(restaurantA.user.email);
    expect(res.body.user.restaurantId).not.toBe(restaurantA.user.restaurantId);
    expect(res.body.user.role).toBe('GERANT');

    // La preuve d'acceptation des CGU du compte doit être reportée sur
    // la nouvelle ligne User, pas laissée vide — même personne, déjà
    // acceptée une fois au bootstrap.
    const newUser = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id as string } });
    expect(newUser.termsAcceptedAt).not.toBeNull();
  });

  it('connexion avec un compte multi-restaurant sans préciser lequel → renvoie la liste pour sélection', async () => {
    const email = `gerant-multi-${suffix}-B@test-foodcfo.local`;
    const restaurantB1 = await bootstrapRestaurant('B1', email);
    const addRes = await request(app)
      .post('/api/restaurants/add')
      .set('Authorization', `Bearer ${restaurantB1.accessToken}`)
      .send({ restaurantName: 'Restaurant multi B2' });
    createdRestaurantIds.push(addRes.body.user.restaurantId);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'MotDePasseTest123!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.requiresRestaurantSelection).toBe(true);
    expect(loginRes.body.accessToken).toBeUndefined();
    expect(loginRes.body.restaurants).toHaveLength(2);
    const names = loginRes.body.restaurants.map((r: { restaurantName: string }) => r.restaurantName);
    expect(names).toContain('Restaurant multi B1');
    expect(names).toContain('Restaurant multi B2');
  });

  it('connexion avec un compte multi-restaurant en précisant le restaurantId → connecte directement au bon', async () => {
    const email = `gerant-multi-${suffix}-C@test-foodcfo.local`;
    const restaurantC1 = await bootstrapRestaurant('C1', email);
    const addRes = await request(app)
      .post('/api/restaurants/add')
      .set('Authorization', `Bearer ${restaurantC1.accessToken}`)
      .send({ restaurantName: 'Restaurant multi C2' });
    const restaurantC2Id = addRes.body.user.restaurantId as string;
    createdRestaurantIds.push(restaurantC2Id);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'MotDePasseTest123!', restaurantId: restaurantC2Id });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.restaurantId).toBe(restaurantC2Id);
  });

  it('liste les restaurants liés au compte avec le bon indicateur "isCurrent"', async () => {
    const restaurantD1 = await bootstrapRestaurant('D1');
    const addRes = await request(app)
      .post('/api/restaurants/add')
      .set('Authorization', `Bearer ${restaurantD1.accessToken}`)
      .send({ restaurantName: 'Restaurant multi D2' });
    createdRestaurantIds.push(addRes.body.user.restaurantId);

    const mineRes = await request(app)
      .get('/api/restaurants/mine')
      .set('Authorization', `Bearer ${restaurantD1.accessToken}`);

    expect(mineRes.status).toBe(200);
    expect(mineRes.body.restaurants).toHaveLength(2);
    const current = mineRes.body.restaurants.find((r: { isCurrent: boolean }) => r.isCurrent);
    expect(current.id).toBe(restaurantD1.user.restaurantId);
  });

  it('bascule vers un autre restaurant du même compte', async () => {
    const restaurantE1 = await bootstrapRestaurant('E1');
    const addRes = await request(app)
      .post('/api/restaurants/add')
      .set('Authorization', `Bearer ${restaurantE1.accessToken}`)
      .send({ restaurantName: 'Restaurant multi E2' });
    const restaurantE2Id = addRes.body.user.restaurantId as string;
    createdRestaurantIds.push(restaurantE2Id);

    const switchRes = await request(app)
      .post('/api/restaurants/switch')
      .set('Authorization', `Bearer ${restaurantE1.accessToken}`)
      .send({ restaurantId: restaurantE2Id });

    expect(switchRes.status).toBe(200);
    expect(switchRes.body.user.restaurantId).toBe(restaurantE2Id);

    // Le nouveau token doit vraiment donner accès aux données de E2, pas E1.
    const dashRes = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${switchRes.body.accessToken}`);
    expect(dashRes.status).toBe(200);
  });

  it('refuse de basculer vers un restaurant qui ne fait pas partie du compte', async () => {
    const restaurantF = await bootstrapRestaurant('F');
    const restaurantOther = await bootstrapRestaurant('Other');

    const switchRes = await request(app)
      .post('/api/restaurants/switch')
      .set('Authorization', `Bearer ${restaurantF.accessToken}`)
      .send({ restaurantId: restaurantOther.user.restaurantId });

    expect(switchRes.status).toBe(403);
  });

  it('agrège correctement la vue consolidée sur plusieurs restaurants', async () => {
    const restaurantG1 = await bootstrapRestaurant('G1');
    const addRes = await request(app)
      .post('/api/restaurants/add')
      .set('Authorization', `Bearer ${restaurantG1.accessToken}`)
      .send({ restaurantName: 'Restaurant multi G2' });
    const restaurantG2Id = addRes.body.user.restaurantId as string;
    createdRestaurantIds.push(restaurantG2Id);

    // Un plat avec marge dans G1.
    const menuItem = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${restaurantG1.accessToken}`)
      .send({ name: 'Plat G1', category: 'Plats', sellingPriceTTC: 20, vatRate: 'TAUX_10' });
    void menuItem;

    const consolidatedRes = await request(app)
      .get('/api/restaurants/consolidated')
      .set('Authorization', `Bearer ${restaurantG1.accessToken}`);

    expect(consolidatedRes.status).toBe(200);
    expect(consolidatedRes.body.totals.restaurantCount).toBe(2);
    expect(consolidatedRes.body.restaurants).toHaveLength(2);
    const names = consolidatedRes.body.restaurants.map((r: { restaurantName: string }) => r.restaurantName);
    expect(names).toContain('Restaurant multi G1');
    expect(names).toContain('Restaurant multi G2');
  });

  it('réservé au Gérant : un compte Cuisine ne peut ni ajouter de restaurant ni voir la vue consolidée', async () => {
    const restaurantH = await bootstrapRestaurant('H');
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurantH.accessToken}`)
      .send({
        email: `cuisine-multi-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Cuisine',
        lastName: 'Test',
        role: 'CUISINE',
      });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: `cuisine-multi-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    const addRes = await request(app)
      .post('/api/restaurants/add')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ restaurantName: 'Ne devrait pas exister' });
    expect(addRes.status).toBe(403);

    const consolidatedRes = await request(app)
      .get('/api/restaurants/consolidated')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);
    expect(consolidatedRes.status).toBe(403);
  });

  it("sécurité : createUser refuse d'inviter un email déjà utilisé sur un AUTRE restaurant (empêche la collision à la source)", async () => {
    const victimEmail = `victime-createuser-${suffix}@test-foodcfo.local`;
    await bootstrapRestaurant('VictimeCreateUser', victimEmail);

    const attacker = await bootstrapRestaurant('AttaquantCreateUser');
    const inviteRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({
        email: victimEmail,
        password: 'MotDePasseAttaquant456!',
        firstName: 'Faux',
        lastName: 'Compte',
        role: 'GERANT',
      });
    expect(inviteRes.status).toBe(409);
    expect(inviteRes.body.error).toBe('EMAIL_TAKEN');
  });

  it("sécurité critique (défense en profondeur) : même si une collision d'email existait déjà en base (sans lien réel entre les comptes), elle ne permettrait PAS de prendre le contrôle d'un autre restaurant via switch, ni de le voir dans /mine ou la vue consolidée", async () => {
    // La "victime" a son propre restaurant, avec son propre mot de
    // passe — aucun rapport avec l'attaquant.
    const victimEmail = `victime-${suffix}@test-foodcfo.local`;
    const victim = await bootstrapRestaurant('Victime', victimEmail);

    // createUser bloque désormais cette collision à la création (voir
    // le test précédent) — pour vérifier que switchRestaurant/
    // listMyRestaurants/getConsolidatedDashboard restent sûrs même
    // dans l'hypothèse où une collision existerait malgré tout (données
    // historiques antérieures à ce correctif, ou tout autre chemin non
    // encore identifié), la collision est créée ici directement en
    // base, en contournant l'API.
    const attacker = await bootstrapRestaurant('Attaquant');
    await prisma.user.create({
      data: {
        restaurantId: attacker.user.restaurantId,
        email: victimEmail,
        passwordHash: await hashPassword('MotDePasseAttaquant456!'),
        role: 'GERANT',
        firstName: 'Faux',
        lastName: 'Compte',
      },
    });

    // L'attaquant se connecte avec CE compte fictif, avec SON propre
    // mot de passe (login reste sûr : il ne matche jamais le hash de
    // la victime avec le mot de passe de l'attaquant).
    const attackerLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: victimEmail, password: 'MotDePasseAttaquant456!', restaurantId: attacker.user.restaurantId });
    expect(attackerLoginRes.status).toBe(200);

    // Sans la vérification du hash dans switchRestaurant, cet appel
    // aurait dû réussir et renvoyer des tokens valides pour LE VRAI
    // compte de la victime, sans jamais connaître son mot de passe.
    const switchRes = await request(app)
      .post('/api/restaurants/switch')
      .set('Authorization', `Bearer ${attackerLoginRes.body.accessToken}`)
      .send({ restaurantId: victim.user.restaurantId });
    expect(switchRes.status).toBe(403);

    // Même protection sur la liste des restaurants "liés au compte" :
    // le restaurant de la victime ne doit jamais y apparaître.
    const mineRes = await request(app)
      .get('/api/restaurants/mine')
      .set('Authorization', `Bearer ${attackerLoginRes.body.accessToken}`);
    expect(mineRes.status).toBe(200);
    const restaurantIds = mineRes.body.restaurants.map((r: { id: string }) => r.id);
    expect(restaurantIds).not.toContain(victim.user.restaurantId);
    expect(restaurantIds).toEqual([attacker.user.restaurantId]);

    // Même protection sur la vue consolidée : les données financières
    // (marge, KPIs) du restaurant de la victime ne doivent jamais être
    // agrégées dans la réponse de l'attaquant.
    const consolidatedRes = await request(app)
      .get('/api/restaurants/consolidated')
      .set('Authorization', `Bearer ${attackerLoginRes.body.accessToken}`);
    expect(consolidatedRes.status).toBe(200);
    expect(consolidatedRes.body.totals.restaurantCount).toBe(1);
    const consolidatedIds = consolidatedRes.body.restaurants.map((r: { restaurantId: string }) => r.restaurantId);
    expect(consolidatedIds).not.toContain(victim.user.restaurantId);
  });

  it("isolation : les plats d'un restaurant du compte ne fuient pas dans l'autre restaurant du même compte", async () => {
    const restaurantI1 = await bootstrapRestaurant('I1');
    const addRes = await request(app)
      .post('/api/restaurants/add')
      .set('Authorization', `Bearer ${restaurantI1.accessToken}`)
      .send({ restaurantName: 'Restaurant multi I2' });
    const restaurantI2Id = addRes.body.user.restaurantId as string;
    createdRestaurantIds.push(restaurantI2Id);

    await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${restaurantI1.accessToken}`)
      .send({ name: 'Plat secret I1', category: 'Plats', sellingPriceTTC: 15, vatRate: 'TAUX_10' });

    const switchRes = await request(app)
      .post('/api/restaurants/switch')
      .set('Authorization', `Bearer ${restaurantI1.accessToken}`)
      .send({ restaurantId: restaurantI2Id });

    const menuFromI2 = await request(app)
      .get('/api/menu-items')
      .set('Authorization', `Bearer ${switchRes.body.accessToken}`);

    const names = (menuFromI2.body.menuItems as { name: string }[]).map((m) => m.name);
    expect(names).not.toContain('Plat secret I1');
  });
});
