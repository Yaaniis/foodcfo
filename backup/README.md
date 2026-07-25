# Sauvegardes automatiques

Railway ne propose pas de sauvegarde automatique native pour Postgres. Ce service comble ce manque : une image `postgres:18-alpine` (pour disposer de `pg_dump` dans la bonne version), déclenchée quotidiennement par le **Cron Schedule** natif de Railway plutôt qu'un service qui tourne en continu, écrivant des dumps compressés sur un volume Railway dédié avec rotation automatique (14 jours par défaut).

## Configuration sur Railway (à faire une seule fois)

1. `railway add --service foodcfo-backup` puis lier le service au Dockerfile de ce dossier (`railway service source connect` ou configuration via le dashboard : Root Directory = `backup`)
2. Attacher un volume, monté sur `/data`
3. Variables d'environnement :
   - `DATABASE_URL` — référence vers la base de production (`${{Postgres-svSr.DATABASE_URL}}` ou l'URL interne directement)
   - `BACKUP_RETENTION_DAYS` (optionnel, défaut 14)
4. Dans Settings → Cron Schedule : `0 3 * * *` (tous les jours à 3h UTC — hors des heures d'usage probable)
5. **Région : EU West**, comme les autres services — les sauvegardes contiennent les mêmes données que la base elle-même, donc soumises à la même exigence RGPD

## Restauration (procédure manuelle, jamais automatisée)

```bash
# Récupérer le fichier depuis le volume (via `railway ssh` ou `railway volume`)
# puis, en local ou dans un environnement de confiance :
gunzip -c foodcfo-2026-07-25T03-00-00Z.sql.gz | psql "$DATABASE_URL_CIBLE"
```

Restaurer vers une base **vide** (ou de test) — jamais directement par-dessus une base en production sans vérification préalable du contenu du dump.

**Testé de bout en bout** (dump réel → restauration vers une base neuve → données vérifiées présentes) avant la mise en place de ce service. Note : restaurer un dump pris avec `pg_dump` 18 vers une cible Postgres 16 (ex. l'environnement de dev local, qui utilise `postgres:16-alpine`) produit une erreur bénigne sur `SET transaction_timeout` (paramètre propre à Postgres 17+, inconnu de la version 16) — sans impact sur les données, qui se restaurent normalement. Restaurer vers une cible Postgres 18 (le scénario réel de reprise après sinistre, puisque la production tourne en 18) ne produit aucune erreur.
