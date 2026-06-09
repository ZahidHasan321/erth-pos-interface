-- Shoulder slope: a categorical body measurement (4 fixed shapes), entered as a
-- required dropdown on the measurement / add-garment / feedback / QC surfaces.
-- Stored on `measurements` next to the numeric dimensions but modelled as an enum.
-- Idempotent: safe to re-run (DB is built via db:push; see memory notes).

DO $$ BEGIN
  CREATE TYPE shoulder_slope AS ENUM ('sloped_down', 'sloped_up', 'straight', 'peaked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE measurements ADD COLUMN IF NOT EXISTS shoulder_slope shoulder_slope;
