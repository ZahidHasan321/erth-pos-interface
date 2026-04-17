-- Migration: job_function enum + column, PIN column lockdown
--
-- WHY
--   1. job_function: terminal workers (cutter, sewer, ironer, etc.) need a dimension
--      distinct from role (hierarchy) and department (workshop/shop). Null = office user.
--   2. PIN lockdown: users.pin (bcrypt hash) was readable by any authenticated user via
--      PostgREST. 4-digit PINs make hash leakage dangerous (offline crack = minutes).
--      Revoking SELECT on the column blocks REST reads while leaving SECURITY DEFINER
--      RPCs (verify_pin) fully functional.
--
-- Transactional is fine — no ALTER TYPE ADD VALUE here; CREATE TYPE runs in a tx.

-- ── job_function enum and column ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_function') THEN
    CREATE TYPE job_function AS ENUM (
      'soaker',
      'cutter',
      'post_cutter',
      'sewer',
      'finisher',
      'ironer',
      'qc'
    );
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS job_function job_function;

-- ── PIN column lockdown ─────────────────────────────────────────────────────
-- Block direct REST reads of the bcrypt hash. SECURITY DEFINER functions
-- (verify_pin, migrate_plaintext_pins, get_login_users) keep working — they
-- run with owner privileges and bypass column grants.
--
-- Supabase roles: `authenticated` = signed-in users; `anon` = pre-login.
-- service_role retains full access (admin backend operations still work).
REVOKE SELECT (pin) ON users FROM authenticated;
REVOKE SELECT (pin) ON users FROM anon;
