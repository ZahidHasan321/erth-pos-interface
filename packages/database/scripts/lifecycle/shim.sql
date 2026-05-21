-- Supabase compatibility shim for the ephemeral workflow-test Postgres.
--
-- triggers.sql and the RLS helper functions reference Supabase-provided
-- objects (the `auth` schema, the `authenticated`/`anon`/`service_role`
-- roles, pgcrypto's crypt()). Plain Postgres does not have these, so we
-- create just enough for the SQL-language helper functions to compile and
-- for the RPCs to run.
--
-- This MUST be applied AFTER the Drizzle schema (tables/enums exist) and
-- BEFORE triggers.sql (its sql-language functions reference auth.uid() at
-- CREATE time).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Supabase runtime roles. NOLOGIN — they only exist so GRANT statements in
-- triggers.sql resolve. We connect as the bootstrap superuser, which
-- BYPASSRLS, so the RLS policies in triggers.sql never block the tests.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- triggers.sql's "implicit cast" bootstrap block iterates a fixed enum list
-- that still includes `accessory_category`. Migration 0011 turned that column
-- into free text and dropped the enum, so schema.ts never creates the type —
-- and the block's EXCEPTION only catches duplicate_object, not a missing type.
-- A harmless placeholder type lets the cast block run unmodified (nothing
-- references this type; accessories.category is text).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accessory_category') THEN
    CREATE TYPE accessory_category AS ENUM ('placeholder');
  END IF;
END $$;

-- triggers.sql does `ALTER PUBLICATION supabase_realtime ADD TABLE ...` to
-- expose tables over Supabase Realtime. Create an empty publication so those
-- ALTERs succeed (Realtime itself is irrelevant to workflow logic).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

-- The real Supabase auth.uid() reads the JWT sub claim. Here we read a
-- transaction/session GUC the test driver sets per scenario so that
-- assert_active_user() / get_my_user_id() / get_my_role() resolve to a
-- seeded user row (users.auth_id = auth.uid()).
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.auth_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.auth_role', true), ''), 'authenticated');
$$;
