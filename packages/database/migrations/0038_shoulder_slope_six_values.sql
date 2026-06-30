-- 0038: Shoulder slope taxonomy change (4 fixed shapes -> 6 named values).
--
-- The categorical body measurement `measurements.shoulder_slope` moves from the
-- old shape taxonomy (sloped_down / sloped_up / straight / peaked) to the
-- stakeholder's six named values. Existing rows are best-effort mapped:
--   sloped_down -> both_down   (LEFT AND RIGHT SHOULDER DOWN)
--   sloped_up   -> both_up     (LEFT AND RIGHT SHOULDER UP)
--   straight    -> both_straight (LEFT AND RIGHT SHOULDER STRAIGHT)
--   peaked      -> both_straight (no analogue; collapsed to straight)
--
-- Postgres enums can't drop values in place, so swap the type: rename old ->
-- create new -> retype column with a CASE map -> drop old. Guarded so a re-run
-- (db built via db:push, migrations applied directly) is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'shoulder_slope' AND e.enumlabel = 'sloped_down'
  ) THEN
    ALTER TYPE shoulder_slope RENAME TO shoulder_slope_old;

    CREATE TYPE shoulder_slope AS ENUM (
      'right_down',
      'right_up',
      'right_straight',
      'both_down',
      'both_up',
      'both_straight'
    );

    ALTER TABLE measurements
      ALTER COLUMN shoulder_slope TYPE shoulder_slope
      USING (
        CASE shoulder_slope::text
          WHEN 'sloped_down' THEN 'both_down'
          WHEN 'sloped_up'   THEN 'both_up'
          WHEN 'straight'    THEN 'both_straight'
          WHEN 'peaked'      THEN 'both_straight'
        END
      )::shoulder_slope;

    -- A historical backup schema also pins the old type. Detach it to text so
    -- the old enum can be dropped without altering the backup's preserved
    -- values (kept verbatim for restorability).
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'backup_custfix_20260629'
        AND table_name = 'measurements'
        AND column_name = 'shoulder_slope'
    ) THEN
      ALTER TABLE backup_custfix_20260629.measurements
        ALTER COLUMN shoulder_slope TYPE text USING shoulder_slope::text;
    END IF;

    DROP TYPE shoulder_slope_old;
  END IF;
END $$;
