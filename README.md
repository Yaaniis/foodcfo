# FoodCFO

Application de suivi des marges et des coûts pour les gérants de restaurants indépendants et petites chaînes (2 à 10 établissements).

Les 6 phases du plan de développement initial sont terminées et validées réellement (voir `FoodCFO_PLAN.md`). Contrats des endpoints API : voir [`API.md`](API.md).

## Fonctionnalités

- **Authentification** multi-tenant (JWT + refresh tokens rotatifs), 3 rôles (Gérant / Cuisine / Service)
- **Carte et fiches techniques** avec allergènes, calcul de marge en temps réel
- **Tableau de bord "Santé des marges"** : marge moyenne, plats en alerte, économies potentielles, seuils configurables
- **Scanner de factures** : upload PDF/JPG/PNG, extraction automatique par IA (Claude vision) avec repli en saisie manuelle si l'extraction échoue
- **Commandes fournisseurs** : panier groupé par fournisseur, suggestions basées sur l'historique, envoi par email avec repli en message copiable
- **Gaspillage et pertes** : déclaration rapide, valorisation automatique, impact chiffré sur la marge
- **Export comptable CSV** et **rapport mensuel automatique par email**
- **Mode hors-ligne partiel** (consultation des marges, saisie de gaspillage avec file de synchronisation) — PWA installable
- **RGPD** : export et suppression des données sur demande

## Stack technique

- **Frontend** : React + TypeScript + Vite, TailwindCSS, PWA
- **Backend** : Node.js + TypeScript, Express, API REST
- **Base de données** : PostgreSQL + Prisma
- **Monorepo** : npm workspaces (`backend`, `frontend`, `packages/shared`)
- **Hébergement cible** : Railway

## Structure du projet

```
foodcfo/
├── backend/          # API Express + Prisma
│   ├── prisma/       # schema.prisma, migrations, seed.ts
│   └── src/
│       ├── controllers/  # logique métier par ressource
│       ├── routes/       # définition des endpoints + rôles requis
│       ├── schemas/      # validation Zod des entrées
│       ├── lib/           # fonctions pures réutilisables (calcul de marge, CSV, email...)
│       ├── middleware/   # auth, rôles, gestion d'erreurs
│       └── test/          # tests d'intégration (supertest)
├── frontend/         # React + Vite (PWA)
│   └── src/
│       ├── pages/     # un composant par écran, un par route
│       ├── components/ # gardes de route (ProtectedRoute, RequireRole...)
│       ├── context/    # session/authentification
│       └── lib/        # client HTTP, calculs partagés, file hors-ligne
├── packages/
│   └── shared/        # Types et schémas partagés backend/frontend
├── docker-compose.yml # PostgreSQL local (dev uniquement)
└── .env.example
```

Monorepo en npm workspaces (décision 0.3) plutôt que des dépôts séparés backend/frontend : un seul `npm install` à la racine, un package `packages/shared` disponible pour du code réellement partagé, et un historique Git unique plus simple à suivre pour un projet de cette taille (pas encore besoin de pipelines CI/CD indépendants par service).

## Démarrage local

```bash
# 1. Installer les dépendances
npm install

# 2. Copier les variables d'environnement (racine, backend ET frontend — Prisma et Vite lisent chacun le .env de leur propre dossier)
copy .env.example .env
copy .env.example backend\.env
copy frontend\.env.example frontend\.env

# 3. Démarrer PostgreSQL en local
docker compose up -d

# 4. Appliquer les migrations et charger les données de test
npm run prisma:migrate
npm run prisma:seed

# 5. Lancer le backend et le frontend (dans deux terminaux)
npm run dev:backend
npm run dev:frontend
```

(Sous Windows, `copy` remplace `cp` — commande à taper dans l'invite de commandes, à la racine du dossier `foodcfo`.)

## Déploiement (Railway)

Cible retenue décision 0.4. Trois services dans un même projet Railway : PostgreSQL (plugin managé), backend, frontend (servi en statique). Testé et fonctionnel le 25/07/2026 — voir le journal de bord pour le détail complet du premier déploiement (bugs rencontrés et corrigés au passage).

⚠️ **Choisir une région UE** à la création du projet (obligatoire RGPD, décision 0.4) — ce n'est pas automatique, Railway propose une région par défaut qui peut être hors UE selon le compte.

### 1. Base de données
Ajouter un plugin PostgreSQL au projet Railway. Récupère automatiquement une variable `DATABASE_URL` (interne) et `DATABASE_PUBLIC_URL` (accessible depuis l'extérieur, utile pour du débogage ponctuel uniquement).

### 2. Service backend
- **Root directory** : `/` (racine du dépôt — nécessaire pour que `npm install` résolve correctement les workspaces du monorepo)
- **Build command** :
  ```
  npm install --include=dev --workspace=backend --workspace=packages/shared --include-workspace-root && npx prisma generate --schema=backend/prisma/schema.prisma && npm run build -w backend
  ```
  (`npm install`, pas `npm ci` — `ci` supprime tout `node_modules` avant d'installer, ce qui entre en conflit avec le cache de build de Railway sur ce monorepo. `--include=dev` est nécessaire même si `NODE_ENV=production` est défini, sinon les dépendances de dev — typescript, prisma CLI — sont sautées et le build échoue.)
- **Start command** : `npx prisma migrate deploy --schema=backend/prisma/schema.prisma && node backend/dist/index.js` (applique les migrations en attente avant chaque démarrage — le champ dédié « Pre-deploy command » de Railway existe mais n'a, dans les faits, jamais déclenché la migration lors des premiers déploiements de ce projet ; la commande combinée dans le start command est la version qui fonctionne réellement, vérifiée dans les logs de production)
- **Variables** : `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `NODE_ENV=production`, `PORT=3001` (fixer explicitement, sinon Railway assigne un port dynamique différent de celui attendu par le domaine généré), `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (générer des valeurs aléatoires dédiées à la production, jamais celles du `.env` local), `JWT_ACCESS_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`, et si souhaité `ANTHROPIC_API_KEY`/`RESEND_API_KEY`/`RESEND_FROM_EMAIL` (sinon repli automatique en saisie/envoi manuel, voir Phases 3/4)
- Générer un domaine public sur le port 3001

### 3. Service frontend
- **Root directory** : `/`
- **Build command** :
  ```
  npm install --include=dev --workspace=frontend --workspace=packages/shared --include-workspace-root && npm run build -w frontend
  ```
- **Start command** : `npx --yes serve -s frontend/dist -l $PORT`
- **Variables** : `VITE_API_BASE_URL` = URL publique du service backend (ⓘ variable lue au **build**, pas au runtime — le backend doit donc déjà avoir son domaine généré avant de builder le frontend), `NODE_ENV=production`
- Générer un domaine public : vérifier dans les logs de démarrage le port réel utilisé par `serve` (visible dans `railway logs`) et le renseigner comme port cible du domaine

### 4. Service de sauvegarde (optionnel mais recommandé)
Railway ne propose aucune sauvegarde automatique native pour Postgres. Voir [`backup/README.md`](backup/README.md) pour la configuration complète (image dédiée avec `pg_dump`, volume, déclenchement quotidien via le Cron Schedule natif de Railway).

### Après déploiement
Vérifier `GET /health` sur le domaine backend (`{"status":"ok","database":"connected"}`), puis charger le domaine frontend et créer un compte de test via `/onboarding` pour valider la chaîne complète.

⚠️ **Piège observé en pratique** : un redéploiement (`railway up`) d'un service peut silencieusement remettre sa région par défaut (`sfo`, US) même après un réglage explicite via `railway service scale`. Revérifier la région de chaque service après tout déploiement plutôt que de la supposer acquise.

## Suivi du projet

Le détail de l'avancement se trouve dans `FoodCFO_PLAN.md` (plan par phase) et `FoodCFO_JOURNAL.md` (journal de bord par session), tenus en dehors de ce dépôt.
