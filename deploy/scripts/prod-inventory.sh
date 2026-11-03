#!/usr/bin/env bash
# READ-ONLY inventory of the Supabase project before shutting it down: every
# schema with user data (row counts), every storage bucket (object counts),
# edge functions in the repo. Runs psql on the VPS (ssh host `erth`); the
# connection string is read from packages/database/.env and sent over stdin.
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
{ echo "$SRC"; cat "$ROOT/deploy/db/prod-inventory.sql"; } \
  | ssh erth 'read -r SRC; docker run --rm -i --network host postgres:17.6 psql "$SRC" -v ON_ERROR_STOP=1 -qAt -F " | " -f -'
