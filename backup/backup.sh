#!/bin/sh
# Sauvegarde quotidienne de la base PostgreSQL de production, déclenchée
# par le Cron Schedule natif de Railway (voir backup/README.md) — Railway
# ne propose aucune sauvegarde automatique native pour Postgres, ce
# service comble ce manque sans dépendre d'un compte tiers (S3 etc.) que
# seul l'utilisateur pourrait créer.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL manquant — impossible de sauvegarder." >&2
  exit 1
fi

BACKUP_DIR="/data/backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
FILE="$BACKUP_DIR/foodcfo-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "🗄️  Sauvegarde en cours vers $FILE ..."
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "✅ Sauvegarde terminée ($SIZE)."

# Rotation : ne garder que les N derniers jours plutôt qu'une croissance
# non bornée du volume.
echo "🧹 Suppression des sauvegardes de plus de $RETENTION_DAYS jours..."
find "$BACKUP_DIR" -name "foodcfo-*.sql.gz" -mtime "+$RETENTION_DAYS" -print -delete

echo "📦 Sauvegardes actuellement conservées :"
ls -lh "$BACKUP_DIR"
