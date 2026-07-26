#!/bin/sh
# Nightly backup: Postgres dump plus the MinIO buckets, then prune.
#
# Runs as a sidecar rather than a host cron job so the schedule travels with the stack —
# a server rebuilt from this repository is backing up from the first boot, instead of
# waiting for someone to remember.
set -eu

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"

mkdir -p "$DEST/postgres" "$DEST/minio"

echo "[$(date -u +%FT%TZ)] dumping database"
# Custom format: compressed, and pg_restore can pull out single tables from it.
pg_dump --format=custom --no-owner --file="$DEST/postgres/kv-$STAMP.dump" "$DATABASE_URL"

echo "[$(date -u +%FT%TZ)] mirroring buckets"
mc alias set backup "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
for bucket in media news avatars; do
  mc mirror --overwrite --quiet "backup/$bucket" "$DEST/minio/$bucket" || true
done

# Prune old dumps. The bucket mirror is a live copy, so it is not versioned here.
find "$DEST/postgres" -name 'kv-*.dump' -mtime "+$KEEP_DAYS" -delete

SIZE="$(du -sh "$DEST" | cut -f1)"
echo "[$(date -u +%FT%TZ)] done — $DEST is $SIZE, keeping $KEEP_DAYS days"

# An off-site copy is the part that survives the server itself dying. Left as an
# explicit opt-in rather than a silent no-op, so its absence is visible in the log.
if [ -n "${OFFSITE_TARGET:-}" ]; then
  echo "[$(date -u +%FT%TZ)] syncing off-site to $OFFSITE_TARGET"
  mc mirror --overwrite --remove --quiet "$DEST" "$OFFSITE_TARGET"
else
  echo "WARNING: OFFSITE_TARGET is not set. Backups exist only on this machine, so a"
  echo "         disk failure loses the database and every backup of it together."
fi
