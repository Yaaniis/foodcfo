import { describe, it, expect } from 'vitest';
import { bootstrapRestaurantSchema, addRestaurantSchema, updateRestaurantSchema } from './restaurant.schemas';

// Couvre le point 3 de l'audit de la suite 44 : bootstrap/add
// acceptaient un z.string() nu pour timezone, alors qu'updateRestaurant
// validait déjà strictement contre la liste IANA — un fuseau invalide
// aurait fait planter Intl.DateTimeFormat (RangeError non catchée,
// lib/timezone.ts) au premier calcul "ce mois-ci" du restaurant
// nouvellement créé.
describe('bootstrapRestaurantSchema — timezone', () => {
  const validGerant = { email: 'test@test-foodcfo.local', password: 'MotDePasseTest123!', firstName: 'A', lastName: 'B' };

  it('accepte le fuseau par défaut quand omis', () => {
    const result = bootstrapRestaurantSchema.safeParse({
      restaurantName: 'Restaurant test',
      gerant: validGerant,
      acceptTerms: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.timezone).toBe('Europe/Paris');
  });

  it('accepte un fuseau IANA valide explicite', () => {
    const result = bootstrapRestaurantSchema.safeParse({
      restaurantName: 'Restaurant test',
      timezone: 'America/New_York',
      gerant: validGerant,
      acceptTerms: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejette un fuseau qui n’existe pas', () => {
    const result = bootstrapRestaurantSchema.safeParse({
      restaurantName: 'Restaurant test',
      timezone: 'Pas/Un_Vrai_Fuseau',
      gerant: validGerant,
      acceptTerms: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('addRestaurantSchema — timezone', () => {
  it('accepte le fuseau par défaut quand omis', () => {
    const result = addRestaurantSchema.safeParse({ restaurantName: 'Restaurant test' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.timezone).toBe('Europe/Paris');
  });

  it('rejette un fuseau qui n’existe pas', () => {
    const result = addRestaurantSchema.safeParse({
      restaurantName: 'Restaurant test',
      timezone: 'Pas/Un_Vrai_Fuseau',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateRestaurantSchema — timezone', () => {
  it('accepte un fuseau IANA valide', () => {
    const result = updateRestaurantSchema.safeParse({ timezone: 'Europe/London' });
    expect(result.success).toBe(true);
  });

  it('rejette un fuseau qui n’existe pas', () => {
    const result = updateRestaurantSchema.safeParse({ timezone: 'Pas/Un_Vrai_Fuseau' });
    expect(result.success).toBe(false);
  });
});
