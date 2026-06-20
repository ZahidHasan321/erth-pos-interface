#!/usr/bin/env bash
#
# One-shot setup for the E2E harness, from a clean state.
#
#   1. start the local Supabase stack (migrations moved aside — they assume a
#      db:push'd schema and fail on `supabase start`, see README)
#   2. build the full app schema into the local DB:
#        drizzle-kit push  →  accessory_category placeholder  →  triggers.sql
#        →  login_with_pin RPC
#   3. seed reference data + 3 loginnable users
#
# Idempotent: safe to re-run. Targets ONLY the local stack (:54321/:54322);
# the schema/trigger SQL is applied via `docker exec psql` so no Node/dotenv is
# involved and the prod URL in packages/database/.env can never be reached.

set -euo pipefail

# Repo root. Resolve via the script's own location (e2e/scripts/ -> repo root),
# using `builtin cd` to dodge any `cd` override in the user's shell profile that
# echoes the path. Fall back to git if needed.
SCRIPT_DIR="$(builtin cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
ROOT="$(builtin cd -- "$SCRIPT_DIR/../.." >/dev/null 2>&1 && pwd -P)"
builtin cd -- "$ROOT"

SUPABASE="$ROOT/node_modules/.bin/supabase"
DB_CONTAINER="supabase_db_mono-repo"
LOCAL_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DRIZZLE_KIT="$ROOT/packages/database/node_modules/.bin/drizzle-kit"

echo "==> [1/3] Ensuring local Supabase is running"
if docker exec "$DB_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
  echo "    already running"
else
  # supabase start applies supabase/migrations on boot; those migrations assume
  # the schema was built via db:push and fail (relation \"garments\" does not
  # exist). Move them aside for the boot, then restore — the app schema is built
  # from the Drizzle schema below, not from supabase/migrations.
  MIGR="$ROOT/supabase/migrations"
  MOVED=0
  if [ -d "$MIGR" ] && [ -n "$(ls -A "$MIGR" 2>/dev/null)" ]; then
    mv "$MIGR" "$MIGR.bak"
    mkdir -p "$MIGR"
    MOVED=1
  fi
  # Always restore the migrations dir, even on failure.
  restore_migrations() {
    if [ "$MOVED" = "1" ]; then
      rm -rf "$MIGR"
      mv "$MIGR.bak" "$MIGR"
    fi
  }
  trap restore_migrations EXIT
  "$SUPABASE" start
  restore_migrations
  trap - EXIT
fi

echo "==> [2/3] Building app schema into the local DB"

echo "    drizzle-kit push:pg"
# Run from packages/database so drizzle.config.ts's relative paths
# (./src/schema.ts) resolve. Its dotenv.config() does NOT override our explicit
# DATABASE_URL (dotenv default is no-override), so this stays pinned to local.
( builtin cd -- "$ROOT/packages/database" \
  && DATABASE_URL="$LOCAL_DB_URL" "$DRIZZLE_KIT" push:pg >/dev/null )

echo "    accessory_category placeholder type (triggers.sql cast-bootstrap needs it)"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='accessory_category') THEN CREATE TYPE accessory_category AS ENUM ('placeholder'); END IF; END \$\$;"

echo "    triggers.sql (RPCs + triggers + RLS)"
# client_min_messages=warning silences the benign idempotent-reapply NOTICEs;
# ON_ERROR_STOP=1 still halts on a real error.
docker cp "$ROOT/packages/database/src/triggers.sql" "$DB_CONTAINER:/tmp/triggers.sql" >/dev/null
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$DB_CONTAINER" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/triggers.sql >/dev/null

echo "    login_with_pin RPC (migration 0014)"
docker cp "$ROOT/packages/database/migrations/0014_login_with_pin_rpc.sql" "$DB_CONTAINER:/tmp/login_rpc.sql" >/dev/null
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$DB_CONTAINER" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/login_rpc.sql >/dev/null

echo "==> [3/3] Seeding reference data + loginnable users"
pnpm --filter e2e exec tsx scripts/seed-users.ts

echo ""
echo "Setup complete. Run the smoke test with:  pnpm --filter e2e test"
