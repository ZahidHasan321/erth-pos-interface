#!/usr/bin/env bash
# Nightly backup: DB dump + media files, keeps the last $KEEP_DAYS days.
# Cron on the VPS (03:00 Kuwait = 00:00 UTC):
#   0 0 * * * /opt/erth/deploy/scripts/backup.sh >> /var/log/erth-backup.log 2>&1
# Copy backups/ off the box too (rclone / rsync to another host) — a backup on
# the same disk is not a backup.
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP=$(date -u +%Y%m%d-%H%M%S)
mkdir -p backups/nightly

docker compose exec -T db pg_dump -U postgres -d postgres --format=custom > "backups/nightly/db-$STAMP.dump"
docker run --rm -v erth_storage:/data/storage:ro -v "$PWD/backups/nightly:/out" alpine:3.20 \
  tar -czf "/out/media-$STAMP.tar.gz" -C /data/storage .

find backups/nightly -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok: db-$STAMP.dump media-$STAMP.tar.gz"
