#!/usr/bin/env sh
# Daily backup: PostgreSQL dump + uploaded files. Keeps the last $KEEP days.
# Cron example: 30 3 * * *  cd /opt/lifeos && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu
KEEP=${KEEP:-14}
DIR=${BACKUP_DIR:-./backups}
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DIR"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DIR/db-$TS.dump"
docker compose run --rm --no-deps -v "$(pwd)/$DIR:/backup" api sh -c "tar czf /backup/uploads-$TS.tgz -C /app/storage uploads"
find "$DIR" -name 'db-*.dump' -mtime +"$KEEP" -delete
find "$DIR" -name 'uploads-*.tgz' -mtime +"$KEEP" -delete
echo "backup ok: $TS"
