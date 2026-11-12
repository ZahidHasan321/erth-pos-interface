#!/usr/bin/env bash
# READ-ONLY full archive of the Supabase database (all schemas: public, the
# backup_* schemas, auth, storage metadata, ...) before shutting it down.
# Dump lands on the VPS in deploy/backups/archive/ and is copied to this PC.
set -euo pipefail
ROOT="$(builtin cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null && pwd -P)"
SRC=$(python3 - "$ROOT/packages/database/.env" <<'PY'
import sys
for l in open(sys.argv[1]):
    l = l.strip()
    if l.startswith("DATABASE_URL="):
        print(l.split("=", 1)[1].strip().strip('"').strip("'"))
PY
)
NAME="supabase-full-$(date -u +%Y%m%d-%H%M%S).dump"
echo "$SRC" | ssh erth "read -r SRC; mkdir -p /opt/erth/deploy/backups/archive && docker run --rm --network host -v /opt/erth/deploy/backups/archive:/out postgres:17.6 pg_dump \"\$SRC\" --format=custom --no-owner --no-privileges --file=/out/$NAME && ls -lh /opt/erth/deploy/backups/archive/$NAME"
mkdir -p "$HOME/erth-archive"
scp -q "erth:/opt/erth/deploy/backups/archive/$NAME" "$HOME/erth-archive/"
echo "local copy: $HOME/erth-archive/$NAME"
