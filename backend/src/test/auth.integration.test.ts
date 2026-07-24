import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';

// ⚠️ Ces tests s'exécutent contre la vraie base de données de
// développement (celle configurée dans backend/.env, démarrée via
// `docker compose up -d`) et supposent que le seed a déjà été exécuté
// (`npm run prisma:seed`) : ils utilisent le compte Gérant du restaurant
// "Le Petit Bouchon" créé par prisma/seed.ts.
const SEED_GERANT_EMAIL = 'sophie@lepetitbouchon.fr';
const SEED_GERANT_PASSWORD = 'MotDePasseTest123!';

describe('POST /api/auth/login', () => {
  it('connecte un utilisateur avec les bons identifiants', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: SEED_GERANT_EMAIL, password: SEED_GERANT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.refreshToken).toBeTypeOf('string');
    expect(res.body.user.role).toBe('GERANT');
  });

  it('refuse un mot de passe incorrect', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: SEED_GERANT_EMAIL, password: 'mauvais-mot-de-passe' });

    expect(res.status).toBe(401);
  });

  it("refuse un email qui n'existe pas", async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'personne@nulle-part.fr', password: 'peu-importe' });

    expect(res.status).toBe(401);
  });

  it('rejette une requête sans mot de passe (validation Zod)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: SEED_GERANT_EMAIL });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe('Cycle du refresh token', () => {
  it("émet un nouveau couple de tokens à partir d'un refresh token valide, et révoque l'ancien (rotation)", async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: SEED_GERANT_EMAIL, password: SEED_GERANT_PASSWORD });

    const firstRefreshToken = loginRes.body.refreshToken;

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken: firstRefreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeTypeOf('string');
    expect(refreshRes.body.refreshToken).not.toBe(firstRefreshToken);

    // L'ancien refresh token doit être révoqué par la rotation — le
    // réutiliser doit maintenant échouer.
    const reuseRes = await request(app).post('/api/auth/refresh').send({ refreshToken: firstRefreshToken });
    expect(reuseRes.status).toBe(401);
  });

  it('refuse un refresh token invalide ou mal formé', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'un-faux-token' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/me', () => {
  it('renvoie le profil complet avec un token valide', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: SEED_GERANT_EMAIL, password: SEED_GERANT_PASSWORD });

    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(SEED_GERANT_EMAIL);
  });

  it('refuse une requête sans token', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('refuse un token invalide', async () => {
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer un-faux-token');
    expect(res.status).toBe(401);
  });
});
