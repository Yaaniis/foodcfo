# FoodCFO

Application de suivi des marges et des coûts pour les gérants de restaurants indépendants et petites chaînes (2 à 10 établissements).

> ⚠️ Ce README est un squelette (Phase 1.2). Les instructions complètes de lancement local et de déploiement seront ajoutées comme livrable final de la Phase 1, une fois le backend et le frontend fonctionnels de bout en bout.

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
├── frontend/         # React + Vite (PWA)
│   └── src/
├── packages/
│   └── shared/        # Types et schémas partagés backend/frontend
├── docker-compose.yml # PostgreSQL local (dev uniquement)
└── .env.example
```

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

## Déploiement

_À documenter une fois la Phase 1 terminée (cible retenue : Railway, voir décision 0.4 dans le plan de développement)._

## Suivi du projet

Le détail de l'avancement se trouve dans `FoodCFO_PLAN.md` (plan par phase) et `FoodCFO_JOURNAL.md` (journal de bord par session), tenus en dehors de ce dépôt.
