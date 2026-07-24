import { defineConfig } from 'vitest/config';

// Nos tests d'intégration (auth, rôles, multi-tenant) partagent tous la
// même vraie base de données de développement et, pour certains, les
// mêmes comptes créés par le seed. Vitest exécute les fichiers de test
// en parallèle par défaut, ce qui provoque des conditions de course
// entre fichiers (deux connexions simultanées avec le même compte au
// même moment, par exemple). On désactive donc le parallélisme entre
// fichiers : un peu plus lent, mais fiable — cohérent avec le choix
// assumé de tester contre la vraie base plutôt qu'une base mockée.
export default defineConfig({
  test: {
    fileParallelism: false,
    // Délai généreux : nos tests font de vrais appels réseau + hachage
    // de mot de passe (argon2, volontairement coûteux en calcul) contre
    // une vraie base de données. Sur une machine chargée (Docker +
    // serveurs de dev + tests en même temps), le délai par défaut de
    // Vitest (5s) peut s'avérer trop court.
    testTimeout: 20000,
  },
});
