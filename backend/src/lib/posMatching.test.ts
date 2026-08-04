import { describe, it, expect } from 'vitest';
import { findBestMenuItemMatch } from './posMatching';

const menuItems = [
  { id: 'm1', name: 'Burger Classic' },
  { id: 'm2', name: 'Burger Végétarien' },
  { id: 'm3', name: 'Salade César' },
];

describe('findBestMenuItemMatch', () => {
  it('trouve une correspondance exacte', () => {
    expect(findBestMenuItemMatch('Burger Classic', menuItems)).toBe('m1');
  });

  it('ignore la casse, les accents et les espaces superflus', () => {
    expect(findBestMenuItemMatch('  salade cesar  ', menuItems)).toBe('m3');
    expect(findBestMenuItemMatch('BURGER VEGETARIEN', menuItems)).toBe('m2');
  });

  it('retrouve un plat quand la caisse ajoute une variante au libellé (correspondance partielle unique)', () => {
    expect(findBestMenuItemMatch('Burger Classic (Menu)', menuItems)).toBe('m1');
  });

  it('refuse de deviner en cas de correspondance partielle ambiguë (Burger seul matche 2 plats)', () => {
    expect(findBestMenuItemMatch('Burger', menuItems)).toBeNull();
  });

  it("renvoie null si aucun plat n'approche du libellé", () => {
    expect(findBestMenuItemMatch('Tiramisu maison', menuItems)).toBeNull();
  });

  it('renvoie null pour un libellé vide', () => {
    expect(findBestMenuItemMatch('   ', menuItems)).toBeNull();
  });

  it("renvoie null si la liste de plats est vide", () => {
    expect(findBestMenuItemMatch('Burger Classic', [])).toBeNull();
  });
});
