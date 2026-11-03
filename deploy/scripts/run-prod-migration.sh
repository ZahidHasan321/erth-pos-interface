#!/usr/bin/env bash
# Run on YOUR PC (not the VPS). Reads the prod Supabase connection string from
# packages/database/.env and runs migrate-from-supabase.sh on the VPS (ssh host
# `erth`). Prod is only READ (pg_dump + file downloads). The URL is sent over
# SSH stdin and never written to disk on the VPS.
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
[[ -n "$SRC" ]] || { echo "DATABASE_URL not found in packages/database/.env" >&2; exit 1; }
SUPABASE_HTTP=$(grep -E '^VITE_SUPABASE_URL=' "$ROOT/apps/pos-interface/.env" | cut -d= -f2-)

echo "$SRC" | ssh erth "read -r SRC; cd /opt/erth/deploy && echo migrate | ./scripts/migrate-from-supabase.sh \"\$SRC\" \"$SUPABASE_HTTP\""
