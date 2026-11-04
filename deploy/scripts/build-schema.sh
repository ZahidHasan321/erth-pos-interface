#!/usr/bin/env bash
# Build the app schema FROM SCRATCH into the compose `db` (empty stack only —
# local rehearsal / e2e). Production data arrives via migrate-from-supabase.sh
# instead, which restores prod's schema + data and then runs post-schema.sql.
#
# Order mirrors e2e/scripts/setup.sh: drizzle push → accessory_category
# placeholder → triggers.sql → 0056 RPC → deploy/db/post-schema.sql.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT/deploy"
set -a; . ./.env; set +a

# Local-only by construction: the compose DB published on 127.0.0.1.
DB_URL="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${DB_PORT:-5432}/postgres"
psql_db() { docker compose exec -T -e PGOPTIONS='-c client_min_messages=warning' db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# On the VPS this compose DB IS production. Refuse unless it is still empty, then
# pass drizzle.config.ts's override (its guard only trusts the e2e port 54322).
if [ -n "$(psql_db -tAc "select to_regclass('public.orders')")" ]; then
  echo "Refusing: the compose DB already has an app schema (public.orders exists)." >&2
  echo "build-schema.sh is for an EMPTY stack only. Production changes go through apply-*.ts." >&2
  exit 1
fi

echo "==> drizzle-kit push (127.0.0.1:${DB_PORT:-5432}, verified empty)"
( cd "$ROOT/packages/database" && DATABASE_URL="$DB_URL" ALLOW_REMOTE_DB=I_KNOW_THIS_IS_PRODUCTION "$ROOT/packages/database/node_modules/.bin/drizzle-kit" push:pg )

echo "==> accessory_category placeholder"
psql_db -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='accessory_category') THEN CREATE TYPE accessory_category AS ENUM ('placeholder'); END IF; END \$\$;"

echo "==> triggers.sql"
psql_db < "$ROOT/packages/database/src/triggers.sql" >/dev/null

echo "==> 0056 stage-history RPC"
psql_db < "$ROOT/packages/database/src/migrations/0056_stage_history_rpc.sql" >/dev/null

echo "==> post-schema.sql (realtime triggers, grants)"
psql_db < "$ROOT/deploy/db/post-schema.sql" >/dev/null

echo "Schema built."
