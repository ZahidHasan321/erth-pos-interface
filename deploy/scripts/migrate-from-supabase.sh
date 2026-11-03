#!/usr/bin/env bash
# Copy the app from a Supabase project into this stack's (EMPTY) database.
#
#   ./scripts/migrate-from-supabase.sh <SOURCE_DB_URL> <SOURCE_SUPABASE_URL>
#
#   SOURCE_DB_URL        postgres connection string of the Supabase DB (READ only:
#                        pg_dump + SELECTs; nothing is written to the source)
#   SOURCE_SUPABASE_URL  https://<ref>.supabase.co — media files are downloaded
#                        from its public `media` bucket, and stored media URLs are
#                        rewritten from it to API_ORIGIN.
#
# Steps: dump `public` (schema + data) → restore → post-schema.sql → rewrite
# media URLs → copy media files → compare row counts table by table.
#
# Run it against PROD only with the owner's explicit go-ahead (CLAUDE.md §0a),
# ideally after stopping writes on the old apps (maintenance window).
set -euo pipefail

SRC="${1:?SOURCE_DB_URL required}"
SRC_HTTP="${2:?SOURCE_SUPABASE_URL required}"; SRC_HTTP="${SRC_HTTP%/}"

cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
set -a; . ./.env; set +a

PG_IMAGE=postgres:17.6
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
DUMP="backups/supabase-public-$STAMP.dump"
NET=$(docker compose ps -q db | xargs docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')

src_psql() { docker run --rm -i --network host "$PG_IMAGE" psql "$SRC" -v ON_ERROR_STOP=1 -qAt "$@"; }
dst_psql() { docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

SRC_HOST=$(python3 -c "import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).hostname)" "$SRC")
echo "Source DB host : $SRC_HOST"
echo "Source media   : $SRC_HTTP"
echo "Target         : compose db (API_ORIGIN=$API_ORIGIN)"
read -r -p "Type 'migrate' to continue: " ok
[[ "$ok" == "migrate" ]] || { echo "aborted"; exit 1; }

if [[ "$(dst_psql -c "SELECT to_regclass('public.users') IS NOT NULL")" == "t" ]]; then
  echo "Target already has an app schema. Reset it first:  docker compose down -v && docker compose up -d db" >&2
  exit 1
fi

echo "==> [1/6] Dumping source public schema → $DUMP"
SRC_TZ=$(src_psql -c "SHOW timezone")
echo "    source timezone: $SRC_TZ"
docker run --rm --network host -v "$PWD/backups:/backups" "$PG_IMAGE" \
  pg_dump "$SRC" --schema=public --no-owner --format=custom --file="/backups/$(basename "$DUMP")"

echo "==> [2/6] Restoring into target"
# A --schema=public dump doesn't carry extensions, yet its indexes/functions
# reference them by the schema they live in on the source (public.gin_trgm_ops).
# Place each extension the source keeps in `public` there on the target too.
for ext in $(src_psql -c "SELECT e.extname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE n.nspname = 'public'"); do
  echo "    extension $ext → public (as on source)"
  dst_psql -c "CREATE EXTENSION IF NOT EXISTS \"$ext\" WITH SCHEMA public; ALTER EXTENSION \"$ext\" SET SCHEMA public;"
done
docker compose cp "$DUMP" db:/tmp/restore.dump
# --no-owner: everything is owned by postgres here. Privileges ARE restored
# (column-level grants on users matter). Errors are collected, then filtered:
# only grants to Supabase-internal roles that don't exist here are expected.
set +e
docker compose exec -T db pg_restore -U postgres -d postgres --no-owner /tmp/restore.dump 2> "backups/restore-$STAMP.log"
set -e
UNEXPECTED=$(grep -E '^pg_restore: error' "backups/restore-$STAMP.log" \
  | grep -vE 'role "(supabase_[a-z_]+|dashboard_user|pgsodium_[a-z_]+|postgres)" does not exist' \
  | grep -vE 'schema "public" already exists' || true)
if [[ -n "$UNEXPECTED" ]]; then
  echo "Unexpected restore errors (full log: backups/restore-$STAMP.log):" >&2
  echo "$UNEXPECTED" >&2
  exit 1
fi

echo "==> [3/6] post-schema.sql (realtime triggers, drop Supabase login bridge, PIN grants)"
dst_psql < db/post-schema.sql >/dev/null

echo "==> [4/6] Rewriting stored media URLs  $SRC_HTTP → $API_ORIGIN"
dst_psql -v old="$SRC_HTTP/storage/v1/object/public/" -v new="$API_ORIGIN/storage/v1/object/public/" <<'SQL'
SELECT set_config('mig.old', :'old', false), set_config('mig.new', :'new', false);
DO $$
DECLARE c record; n bigint; total bigint := 0;
BEGIN
  FOR c IN
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying', 'jsonb', 'json')
      AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = replace(%I::text, current_setting(''mig.old''), current_setting(''mig.new''))::%s
       WHERE %I::text LIKE ''%%'' || current_setting(''mig.old'') || ''%%''',
      c.table_name, c.column_name, c.column_name,
      CASE c.data_type WHEN 'character varying' THEN 'varchar' ELSE c.data_type END,
      c.column_name);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE '  %.%: % rows', c.table_name, c.column_name, n; total := total + n; END IF;
  END LOOP;
  RAISE NOTICE '  total rows rewritten: %', total;
END $$;
SQL

echo "==> [5/6] Copying media files"
src_psql -c "SELECT name FROM storage.objects WHERE bucket_id = 'media' ORDER BY name" > "backups/media-list-$STAMP.txt"
COUNT=$(wc -l < "backups/media-list-$STAMP.txt")
echo "    $COUNT objects"
docker run --rm -i --network host -v erth_storage:/data/storage -e SRC_HTTP="$SRC_HTTP" alpine:3.20 sh -c '
  apk add -q curl >/dev/null
  fail=0
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    dest="/data/storage/media/$name"
    [ -s "$dest" ] && continue
    mkdir -p "$(dirname "$dest")"
    enc=$(printf %s "$name" | sed "s/ /%20/g")
    curl -sfL --retry 3 -o "$dest" "$SRC_HTTP/storage/v1/object/public/media/$enc" || { echo "    FAILED: $name"; fail=$((fail+1)); }
  done
  chown -R 1000:1000 /data/storage
  echo "    download failures: $fail"
  [ "$fail" -eq 0 ]
' < "backups/media-list-$STAMP.txt" || { echo "Media copy incomplete — re-run (already-copied files are skipped)." >&2; exit 1; }
FILES=$(docker run --rm -v erth_storage:/data/storage alpine:3.20 sh -c 'find /data/storage/media -type f | wc -l')
[[ "$FILES" -ge "$COUNT" ]] || { echo "Only $FILES of $COUNT media files on disk" >&2; exit 1; }
echo "    $FILES files on disk"

echo "==> [6/6] Verifying row counts"
COUNT_SQL="SELECT string_agg(format('SELECT %L AS t, count(*) AS n FROM public.%I', tablename, tablename), ' UNION ALL ' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public'"
Q=$(dst_psql -c "$COUNT_SQL")
diff <(src_psql -F' ' -c "$Q" | sort) <(dst_psql -F' ' -c "$Q" | sort) \
  && echo "    all $(dst_psql -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'") tables match" \
  || { echo "ROW COUNT MISMATCH (left = source, right = target)" >&2; exit 1; }

echo
echo "Done. Dump kept at $DUMP. Next: docker compose restart rest api && ./scripts/smoke.sh <user> <pin>"
