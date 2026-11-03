-- ============================================================================
-- Platform layer for the self-hosted stack (Postgres + PostgREST + api).
--
-- Recreates the small slice of Supabase the app schema depends on, so the
-- existing app schema (triggers.sql, RLS policies, a pg_dump of prod's
-- `public` schema) loads unchanged:
--   - roles anon / authenticated / service_role + the PostgREST login role
--   - schema `extensions` holding pgcrypto + pg_trgm (functions pin
--     `search_path = public, extensions, ...`)
--   - auth.uid() / auth.role() / auth.jwt() reading PostgREST's JWT claims
--   - auth.refresh_tokens (sessions issued by the api service)
--   - auth.login_attempts (per-username login try limit, api service)
--   - an empty `supabase_realtime` publication (triggers.sql adds tables to
--     it; nothing consumes it — realtime is LISTEN/NOTIFY, see realtime.sql)
--   - PostgREST schema-cache auto-reload on DDL
--
-- Runs once on an empty data volume (docker-entrypoint-initdb.d). Every
-- statement is idempotent so it can also be re-applied by hand.
-- Passwords come from psql variables set by 01-passwords.sh.
-- ============================================================================

\set ON_ERROR_STOP on

-- ── Roles ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  -- PostgREST connects as this and SET ROLEs to the JWT's `role` claim.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT;
  END IF;
  -- The api service (login, refresh, realtime LISTEN, storage). Acts with
  -- service_role rights; owns nothing in public.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'api_server') THEN
    CREATE ROLE api_server LOGIN INHERIT;
  END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT service_role TO api_server;

-- Same per-role statement timeouts hosted Supabase applies.
ALTER ROLE anon SET statement_timeout = '3s';
ALTER ROLE authenticated SET statement_timeout = '8s';

-- ── Schemas & extensions ────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role, api_server;
-- Supabase's default search_path; unqualified gin_trgm_ops / crypt() rely on it.
ALTER DATABASE postgres SET search_path = "$user", public, extensions;

GRANT USAGE, CREATE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Hosted Supabase granted these on every public object by default; prod's
-- tables carry these grants (they arrive with the pg_dump). Mirror the
-- default so a schema built fresh (drizzle push + triggers.sql) behaves the
-- same. RLS + column grants in triggers.sql are what actually restrict access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
-- Functions are deliberately NOT default-granted: they get EXECUTE via PUBLIC,
-- so triggers.sql's `REVOKE ... FROM PUBLIC` on the PIN functions really locks
-- them down.

-- ── auth schema: JWT accessors ──────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, api_server;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt()->>'sub', '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt()->>'role', '')
$$;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role()
  TO anon, authenticated, service_role, api_server;

-- ── auth.refresh_tokens: sessions minted by the api service ─────────────────
-- Only a SHA-256 of the token is stored. `sub` = public.users.auth_id (the
-- JWT subject every RLS helper matches on). Rotated on every refresh.
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  token_hash   text PRIMARY KEY,
  sub          uuid        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  -- Set when the token is exchanged for a new pair; it stays usable for a
  -- short grace window (concurrent tabs). revoked_at = hard revoke, no grace.
  rotated_at   timestamptz,
  revoked_at   timestamptz,
  user_agent   text
);
ALTER TABLE auth.refresh_tokens ADD COLUMN IF NOT EXISTS rotated_at timestamptz;
CREATE INDEX IF NOT EXISTS refresh_tokens_sub_idx ON auth.refresh_tokens (sub);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx ON auth.refresh_tokens (expires_at);
REVOKE ALL ON auth.refresh_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.refresh_tokens TO service_role, api_server;

-- ── auth.login_attempts: per-username login try limit (api service) ─────────
-- Keyed on the lowercased submitted username, existing or not. Also created
-- by post-schema.sql for databases initialised before this table existed.
CREATE TABLE IF NOT EXISTS auth.login_attempts (
  username        text PRIMARY KEY,   -- lower(submitted username)
  failures        int         NOT NULL,
  first_failed_at timestamptz NOT NULL,
  locked_until    timestamptz
);
REVOKE ALL ON auth.login_attempts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.login_attempts TO service_role, api_server;

-- ── Realtime publication placeholder ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- ── PostgREST: reload schema cache after any DDL ────────────────────────────
CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
LANGUAGE plpgsql AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'pgrst_ddl_watch') THEN
    CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
      EXECUTE FUNCTION extensions.pgrst_ddl_watch();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'pgrst_drop_watch') THEN
    CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
      EXECUTE FUNCTION extensions.pgrst_ddl_watch();
  END IF;
END $$;
