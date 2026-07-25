import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { createPasswordResetToken } from '../lib/passwordReset';
import { hashToken } from '../utils/tokens';

// L'environnement de test n'a pas de vraie clé RESEND_API_KEY : l'email
// de réinitialisation ne part donc jamais réellement (même situation que
// les autres tests d'intégration touchant l'envoi d'email). Le token
// brut est obtenu directement via createPasswordResetToken() plutôt que
// par interception d'email, impossible ici.
describe('Mot de passe oublié / réinitialisation', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string, email: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant reset ${label}`,
        gerant: { email, password: 'MotDePasseInitial123!', firstName: 'Test', lastName: label },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; refreshToken: string; user: { restaurantId: string } };
  }

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { email: { contains: `reset-${suffix}` } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('renvoie le même message générique, que le compte existe ou non, et ne crée un token que si le compte existe', async () => {
    const email = `reset-${suffix}-a@test-foodcfo.local`;
    await bootstrapRestaurant('A', email);

    const existingRes = await request(app).post('/api/auth/forgot-password').send({ email });
    const unknownRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `reset-${suffix}-inconnu@test-foodcfo.local` });

    expect(existingRes.status).toBe(200);
    expect(unknownRes.status).toBe(200);
    expect(existingRes.body.message).toBe(unknownRes.body.message);

    const tokensForExisting = await prisma.passwordResetToken.count({ where: { email } });
    const tokensForUnknown = await prisma.passwordResetToken.count({
      where: { email: `reset-${suffix}-inconnu@test-foodcfo.local` },
    });
    expect(tokensForExisting).toBe(1);
    expect(tokensForUnknown).toBe(0);
  });

  it('réinitialise le mot de passe avec un token valide, révoque les sessions existantes, et refuse la réutilisation du token', async () => {
    const email = `reset-${suffix}-b@test-foodcfo.local`;
    const restaurant = await bootstrapRestaurant('B', email);

    const rawToken = await createPasswordResetToken(email);

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'NouveauMotDePasse456!' });
    expect(resetRes.status).toBe(204);

    // L'ancien mot de passe ne fonctionne plus, le nouveau fonctionne.
    const oldLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'MotDePasseInitial123!' });
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'NouveauMotDePasse456!' });
    expect(newLoginRes.status).toBe(200);

    // La session ouverte avant la réinitialisation doit être coupée.
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: restaurant.refreshToken });
    expect(refreshRes.status).toBe(401);

    // Le token de réinitialisation ne doit pas être réutilisable.
    const reuseRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'EncoreUnAutre789!' });
    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.error).toBe('INVALID_RESET_TOKEN');
  });

  it('refuse un token inconnu', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'un-token-qui-n-existe-pas', newPassword: 'PeuImporte123!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_RESET_TOKEN');
  });

  it('refuse un token expiré', async () => {
    const email = `reset-${suffix}-c@test-foodcfo.local`;
    await bootstrapRestaurant('C', email);
    const rawToken = await createPasswordResetToken(email);

    // Force l'expiration plutôt que d'attendre 1h en conditions réelles.
    await prisma.passwordResetToken.update({
      where: { tokenHash: hashToken(rawToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'PeuImporte123!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_RESET_TOKEN');
  });

  it('synchronise le nouveau mot de passe sur tous les restaurants d’un compte multi-établissement', async () => {
    const email = `reset-${suffix}-d@test-foodcfo.local`;
    const first = await bootstrapRestaurant('D1', email);

    await request(app)
      .post('/api/restaurants/add')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ restaurantName: `Restaurant reset D2 ${suffix}` });

    const rawToken = await createPasswordResetToken(email);
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'MotDePartageNeuf123!' });
    expect(resetRes.status).toBe(204);

    // Connexion multi-restaurant : sans restaurantId précisé, la réponse
    // liste les deux restaurants — prouve que le nouveau mot de passe
    // correspond aux DEUX lignes User, pas juste la première.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'MotDePartageNeuf123!' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.requiresRestaurantSelection).toBe(true);
    expect(loginRes.body.restaurants).toHaveLength(2);
  });
});
