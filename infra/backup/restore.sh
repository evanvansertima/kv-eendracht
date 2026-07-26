#!/bin/sh
# Restores a dump into a database.
#
# A backup that has never been restored is not a backup. This script exists so the drill
# is a command someone can actually run, not a paragraph in a document.
#
#   docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
#     run --rm backup /scripts/restore.sh /backups/postgres/kv-20260726T030000Z.dump
set -eu

DUMP="${1:?usage: restore.sh <dump-file> [target-database-url]}"
TARGET="${2:-${RESTORE_DATABASE_URL:-}}"

if [ -z "$TARGET" ]; then
  echo "Refusing to run: no target given."
  echo
  echo "Pass one explicitly, or set RESTORE_DATABASE_URL. This is deliberate — the"
  echo "default must never be the live database, because a mistyped drill would then"
  echo "overwrite production with an old dump."
  exit 1
fi

case "$TARGET" in
  "$DATABASE_URL")
    echo "Refusing to restore over the live database."
    echo "Restore into a scratch database and promote it once verified."
    exit 1
    ;;
esac

echo "Restoring $DUMP into $TARGET"
pg_restore --clean --if-exists --no-owner --dbname="$TARGET" "$DUMP"

echo "Verifying"
psql "$TARGET" -tAc "select 'tabellen: '||count(*) from information_schema.tables where table_schema='public'"
psql "$TARGET" -tAc "select 'spelers: '||count(*) from public.player_profiles"
psql "$TARGET" -tAc "select 'uitslagen: '||count(*) from public.match_results"
echo "Restore complete. Compare the counts above against what you expect."
