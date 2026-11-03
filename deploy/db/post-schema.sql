-- ============================================================================
-- Applied AFTER the app schema exists (fresh build or restored prod dump).
-- Idempotent — safe to re-run after every schema change.
--
-- 1. Realtime: per-row NOTIFY on the tables the apps watch. The api service
--    LISTENs on channel `realtime` and fans events out over SSE. Payloads are
--    deliberately slim (only the fields the apps' invalidation hooks read) —
--    pg_notify caps a payload at 8000 bytes and clients only use these to
--    invalidate caches, then refetch through RLS.
-- 2. Drop the Supabase-only login bridge (it writes auth.users, which does
--    not exist here; login is the api service's /auth/v1/login).
-- 3. PIN primitives locked to service_role.
-- 4. auth.login_attempts (also in init/00-platform.sql) for databases whose
--    init ran before it existed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.realtime_slim(p_table text, r jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN r IS NULL THEN NULL
    WHEN p_table = 'garments' THEN
      jsonb_build_object('id', r->'id', 'order_id', r->'order_id', 'location', r->'location')
    WHEN p_table = 'notifications' THEN
      jsonb_build_object(
        'id', r->'id', 'department', r->'department', 'scope', r->'scope',
        'recipient_user_id', r->'recipient_user_id', 'title', r->'title',
        'body', to_jsonb(left(r->>'body', 1000)), 'type', r->'type', 'brand', r->'brand')
    ELSE jsonb_build_object('id', r->'id')
  END
$$;

CREATE OR REPLACE FUNCTION public.realtime_notify()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('realtime', jsonb_build_object(
    'table', TG_TABLE_NAME,
    'type',  TG_OP,
    'new',   CASE WHEN TG_OP <> 'DELETE' THEN public.realtime_slim(TG_TABLE_NAME, to_jsonb(NEW)) END,
    'old',   CASE WHEN TG_OP <> 'INSERT' THEN public.realtime_slim(TG_TABLE_NAME, to_jsonb(OLD)) END
  )::text);
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.realtime_notify() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.realtime_slim(text, jsonb) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  -- Same list triggers.sql puts in the supabase_realtime publication.
  FOREACH t IN ARRAY ARRAY[
    'garments', 'orders', 'work_orders', 'dispatch_log',
    'order_shelf_items', 'transfer_requests', 'transfer_request_items',
    'fabrics', 'shelf', 'accessories', 'notifications'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS realtime_notify ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER realtime_notify AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.realtime_notify()', t);
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.login_with_pin(text, text);

-- 3. PIN / account primitives are service_role-only (triggers.sql intent).
--    Hosted Supabase default-granted EXECUTE on functions to anon/authenticated
--    explicitly, which `REVOKE ... FROM PUBLIC` does not undo — so a restored
--    prod dump may carry those grants. Strip them.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.verify_pin(text, text)', 'public.set_user_pin(uuid, text)',
    'public.link_auth_id(uuid, uuid)', 'public.migrate_plaintext_pins()'
  ]
  LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END $$;

-- 4. Per-username login try limit (api service). Same DDL as init/00-platform.sql.
CREATE TABLE IF NOT EXISTS auth.login_attempts (
  username        text PRIMARY KEY,   -- lower(submitted username)
  failures        int         NOT NULL,
  first_failed_at timestamptz NOT NULL,
  locked_until    timestamptz
);
REVOKE ALL ON auth.login_attempts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.login_attempts TO service_role, api_server;
