-- Migration: users.job_function (single enum) → users.job_functions (enum array)
--
-- WHY
--   Cross-trained workers (e.g. sewer + qc, finisher + ironer) need to hold
--   multiple terminal roles. The single column forced admins to pick one,
--   under-counting capacity in the scheduler and splitting per-stage KPIs
--   across "ghost" accounts. One row per (user, job) in `resources` keeps
--   each stage's targets and reports clean; the users.job_functions array
--   is the authoritative list of what a person is qualified to do.
--
-- BACKFILL
--   Each existing user with a non-null job_function gets ARRAY[that_value].
--   Office staff (NULL) get '{}'.
--
-- Transactional: no ALTER TYPE ADD VALUE here.

-- 1. Add the new array column with a safe default
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS job_functions job_function[] NOT NULL DEFAULT '{}';

-- 2. Backfill from the old single column (idempotent — only fills empty rows)
UPDATE users
   SET job_functions = ARRAY[job_function]
 WHERE job_function IS NOT NULL
   AND (job_functions IS NULL OR job_functions = '{}');

-- 3. Drop the old column. Triggers and edge functions are updated in the
--    same deploy; nothing reads job_function after this point.
ALTER TABLE users
  DROP COLUMN IF EXISTS job_function;

-- 4. Prevent duplicate (user_id, responsibility) rows in resources so a
--    user can't accidentally have two "sewer" rows. user_id NULL rows
--    (resources without a linked user) are excluded — they're allowed to
--    duplicate by responsibility.
CREATE UNIQUE INDEX IF NOT EXISTS resources_user_resp_uniq
  ON resources (user_id, responsibility)
  WHERE user_id IS NOT NULL AND responsibility IS NOT NULL;
