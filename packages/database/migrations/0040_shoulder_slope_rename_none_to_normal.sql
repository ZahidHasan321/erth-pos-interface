-- Migration 0040: rename the shoulder_slope enum value `none` -> `normal`.
-- `none` was the stored value labelled "NORMAL" (no notable slope), distinct
-- from NULL. Renaming the enum value re-labels every existing row in place
-- (RENAME VALUE is a pure relabel, no data rewrite). Idempotent: skip if the
-- old value is already gone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'shoulder_slope' AND e.enumlabel = 'none'
  ) THEN
    ALTER TYPE shoulder_slope RENAME VALUE 'none' TO 'normal';
  END IF;
END $$;
