#!/usr/bin/env sh
# Restore a dump created by backup.sh:  ./scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.dump
# DESTRUCTIVE: replaces the current database contents. Asks for confirmation.
set -eu
[ -f "${1:-}" ] || { echo "usage: $0 <dump-file>"; exit 1; }
printf "This will OVERWRITE the current database. Type RESTORE to continue: "; read -r ans
[ "$ans" = "RESTORE" ] || { echo "aborted"; exit 1; }
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < "$1"
echo "restore ok"
