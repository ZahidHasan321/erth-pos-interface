-- Collar position moves from a garment style-option to a body measurement: it is
-- entered next to shoulder_slope on `measurements` (per Abdulrahman — "collar
-- position is part of the measurement, not an option"). The enum (up/down; null =
-- the neutral "Standard") is unchanged; only its home table moves.
-- Idempotent: safe to re-run (DB is built via db:push; see memory notes).

-- The collar_position enum type already exists (it backed garments.collar_position).
-- Guard a CREATE for parity with a fresh db:push build.
DO $$ BEGIN
  CREATE TYPE collar_position AS ENUM ('up', 'down');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE measurements ADD COLUMN IF NOT EXISTS collar_position collar_position;

-- Backfill each measurement from its linked garments. A measurement is shared
-- across sibling garments; if they disagree (pre-UAT test data), the brova's
-- value wins, then any non-null final, deterministic by garment_id.
UPDATE measurements m
SET collar_position = sub.collar_position
FROM (
  SELECT DISTINCT ON (measurement_id) measurement_id, collar_position
  FROM garments
  WHERE measurement_id IS NOT NULL AND collar_position IS NOT NULL
  ORDER BY measurement_id, (garment_type = 'brova') DESC, garment_id
) sub
WHERE m.id = sub.measurement_id
  AND m.collar_position IS NULL;

ALTER TABLE garments DROP COLUMN IF EXISTS collar_position;
