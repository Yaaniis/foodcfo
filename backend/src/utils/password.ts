// Hashage des mots de passe avec argon2 (recommandé dans le prompt
// d'origine, plus robuste que bcrypt face aux attaques par GPU).

import argon2 from 'argon2';

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword);
}

export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // Hash corrompu ou format inattendu — on traite comme un échec de
    // vérification plutôt que de laisser l'erreur remonter brute.
    return false;
  }
}
