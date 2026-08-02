import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// PNG minimal valide côté magic bytes (8 premiers octets vérifiés par
// detectFileType) — même approche que invoice.integration.test.ts avec
// '%PDF-1.4...' pour un PDF factice.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);

describe('Hygiène — contenu de référence', () => {
  const suffix = Date.now();
  const createdRestaurantIds: string[] = [];

  async function bootstrapRestaurant(label: string) {
    const res = await request(app)
      .post('/api/restaurants/bootstrap')
      .send({
        restaurantName: `Restaurant hygiène ${label}`,
        gerant: {
          email: `gerant-hygiene-${suffix}-${label}@test-foodcfo.local`,
          password: 'MotDePasseTest123!',
          firstName: 'Test',
          lastName: label,
        },
        acceptTerms: true,
      });
    createdRestaurantIds.push(res.body.user.restaurantId as string);
    return res.body as { accessToken: string; user: { id: string; restaurantId: string } };
  }

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } });
  });

  it('crée un rappel avec image, le liste sans les octets bruts, sert le média séparément, le modifie, le supprime', async () => {
    const restaurant = await bootstrapRestaurant('A');

    const create = await request(app)
      .post('/api/hygiene/reference-items')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .field('title', 'Lavage des mains')
      .field('content', 'Se laver les mains avant chaque service.')
      .attach('media', PNG_BYTES, 'poster.png');
    expect(create.status).toBe(201);
    expect(create.body.referenceItem).toMatchObject({ title: 'Lavage des mains', hasMedia: true });
    expect(create.body.referenceItem.mediaData).toBeUndefined();

    const list = await request(app)
      .get('/api/hygiene/reference-items')
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.referenceItems).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('mediaData');

    const media = await request(app)
      .get(`/api/hygiene/reference-items/${create.body.referenceItem.id}/media`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(media.status).toBe(200);
    expect(media.headers['content-type']).toBe('image/png');

    const update = await request(app)
      .patch(`/api/hygiene/reference-items/${create.body.referenceItem.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .field('title', 'Lavage des mains (mis à jour)')
      .field('content', 'Se laver les mains avant chaque service, 30 secondes minimum.');
    expect(update.status).toBe(200);
    expect(update.body.referenceItem.title).toBe('Lavage des mains (mis à jour)');
    expect(update.body.referenceItem.hasMedia).toBe(true); // média conservé, pas remplacé ici

    const del = await request(app)
      .delete(`/api/hygiene/reference-items/${create.body.referenceItem.id}`)
      .set('Authorization', `Bearer ${restaurant.accessToken}`);
    expect(del.status).toBe(204);
  });

  it('rejette un fichier qui n\'est ni un JPG ni un PNG', async () => {
    const restaurant = await bootstrapRestaurant('B');
    const res = await request(app)
      .post('/api/hygiene/reference-items')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .field('title', 'Test')
      .field('content', 'Contenu')
      .attach('media', Buffer.from('<html>pas une image</html>'), 'fichier.png');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  it('accepte un rappel sans média (optionnel)', async () => {
    const restaurant = await bootstrapRestaurant('C');
    const res = await request(app)
      .post('/api/hygiene/reference-items')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({ title: 'Sans image', content: 'Contenu texte seul.' });
    expect(res.status).toBe(201);
    expect(res.body.referenceItem.hasMedia).toBe(false);
  });

  it('lecture ouverte à toute l\'équipe, écriture réservée au Gérant', async () => {
    const restaurant = await bootstrapRestaurant('D');
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${restaurant.accessToken}`)
      .send({
        email: `service-hygiene-${suffix}@test-foodcfo.local`,
        password: 'MotDePasseTest123!',
        firstName: 'Service',
        lastName: 'Test',
        role: 'SERVICE',
      });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `service-hygiene-${suffix}@test-foodcfo.local`, password: 'MotDePasseTest123!' });

    const list = await request(app)
      .get('/api/hygiene/reference-items')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(list.status).toBe(200);

    const create = await request(app)
      .post('/api/hygiene/reference-items')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ title: 'Test', content: 'Contenu' });
    expect(create.status).toBe(403);
  });

  it('isolation multi-tenant : un restaurant ne voit ni ne peut modifier/supprimer les rappels d\'un autre', async () => {
    const restaurantA = await bootstrapRestaurant('E');
    const restaurantB = await bootstrapRestaurant('F');

    const created = await request(app)
      .post('/api/hygiene/reference-items')
      .set('Authorization', `Bearer ${restaurantA.accessToken}`)
      .send({ title: 'Rappel A', content: 'Contenu A' });

    const listB = await request(app)
      .get('/api/hygiene/reference-items')
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(listB.body.referenceItems).toHaveLength(0);

    const delCrossTenant = await request(app)
      .delete(`/api/hygiene/reference-items/${created.body.referenceItem.id}`)
      .set('Authorization', `Bearer ${restaurantB.accessToken}`);
    expect(delCrossTenant.status).toBe(404);
  });
});
