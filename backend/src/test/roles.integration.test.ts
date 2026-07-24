import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';

// Utilise les 3 comptes du seed (un par rôle) pour vérifier que les
// permissions déclarées dans les routeurs sont réellement appliquées —
// pas seulement documentées en commentaire.
const CREDENTIALS = {
  GERANT: { email: 'sophie@lepetitbouchon.fr', password: 'MotDePasseTest123!' },
  CUISINE: { email: 'karim@lepetitbouchon.fr', password: 'MotDePasseTest123!' },
  SERVICE: { email: 'lea@lepetitbouchon.fr', password: 'MotDePasseTest123!' },
} as const;

async function loginAs(role: keyof typeof CREDENTIALS): Promise<string> {
  const res = await request(app).post('/api/auth/login').send(CREDENTIALS[role]);
  if (res.status !== 200 || !res.body.accessToken) {
    // Erreur explicite plutôt qu'un token "undefined" silencieux qui
    // ferait échouer la requête suivante avec un 401 difficile à
    // rattacher à sa vraie cause (la connexion elle-même a échoué).
    throw new Error(
      `Échec de connexion de test pour le rôle ${role} (statut ${res.status}) : ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.accessToken as string;
}

describe('Permissions par rôle', () => {
  it('un compte Service ne peut PAS créer de plat (403)', async () => {
    const token = await loginAs('SERVICE');
    const res = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test interdit', category: 'Plats', sellingPriceTTC: 10, vatRate: 'TAUX_10' });

    expect(res.status).toBe(403);
  });

  it('un compte Cuisine PEUT créer un plat (décision 0.5 : la Cuisine gère les fiches techniques)', async () => {
    const token = await loginAs('CUISINE');
    const res = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Test Cuisine ${Date.now()}`, category: 'Plats', sellingPriceTTC: 10, vatRate: 'TAUX_10' });

    expect(res.status).toBe(201);

    // Nettoyage : le Gérant supprime le plat de test créé.
    const gerantToken = await loginAs('GERANT');
    await request(app)
      .delete(`/api/menu-items/${res.body.menuItem.id}`)
      .set('Authorization', `Bearer ${gerantToken}`);
  });

  it('un compte Cuisine ne peut PAS supprimer un plat (réservé au Gérant, plus sensible)', async () => {
    const cuisineToken = await loginAs('CUISINE');
    const createRes = await request(app)
      .post('/api/menu-items')
      .set('Authorization', `Bearer ${cuisineToken}`)
      .send({ name: `À supprimer ${Date.now()}`, category: 'Plats', sellingPriceTTC: 5, vatRate: 'TAUX_10' });

    const deleteRes = await request(app)
      .delete(`/api/menu-items/${createRes.body.menuItem.id}`)
      .set('Authorization', `Bearer ${cuisineToken}`);

    expect(deleteRes.status).toBe(403);

    // Nettoyage : le Gérant, lui, peut supprimer.
    const gerantToken = await loginAs('GERANT');
    await request(app)
      .delete(`/api/menu-items/${createRes.body.menuItem.id}`)
      .set('Authorization', `Bearer ${gerantToken}`);
  });

  it('un compte Service PEUT consulter la carte (lecture ouverte aux 3 rôles)', async () => {
    const token = await loginAs('SERVICE');
    const res = await request(app).get('/api/menu-items').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("un compte Cuisine ne peut PAS gérer l'équipe (réservé au Gérant)", async () => {
    const token = await loginAs('CUISINE');
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("un compte Gérant PEUT gérer l'équipe", async () => {
    const token = await loginAs('GERANT');
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
