-- Migration: promote workshop "unit" from free-text label to first-class table
--
-- WHY
--   resources.unit was a text column. You couldn't create a unit without first
--   adding a worker for it, rename didn't propagate, typos created ghost units,
--   and there was no place to hang future unit-level fields (capacity, notes).
--
--   Now: units(id, stage, name) is the source of truth. resources.unit_id
--   foreign-keys into it. Old resources.unit text column is kept and auto-synced
--   via trigger, so existing scheduler / PlanDialog / performance code that
--   reads resources.unit keeps working until each consumer is migrated to join
--   through unit_id.
--
-- SAFE TO REPLAY: every step uses IF NOT EXISTS / ON CONFLICT DO NOTHING.

-- ── 1. production_stage enum ───────────────────────────────────────────────
-- Matches the scheduler stage keys (verb nouns) rather than job_function
-- (person nouns: sewer vs sewing). Keeping them distinct avoids UI translation
-- layers every time a unit is rendered.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'production_stage') THEN
    CREATE TYPE production_stage AS ENUM (
      'soaking',
      'cutting',
      'post_cutting',
      'sewing',
      'finishing',
      'ironing',
      'quality_check'
    );
  END IF;
END $$;

-- ── 2. units table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage production_stage NOT NULL,
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage, name)
);

CREATE INDEX IF NOT EXISTS units_stage_idx ON units(stage);

-- ── 3. resources.unit_id FK ────────────────────────────────────────────────
ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS resources_unit_id_idx ON resources(unit_id);

-- ── 4. Backfill units from existing (responsibility, unit) pairs ──────────
-- Only takes rows where responsibility is a valid production_stage value.
INSERT INTO units (stage, name)
SELECT DISTINCT responsibility::production_stage, unit
FROM resources
WHERE responsibility IS NOT NULL
  AND unit IS NOT NULL
  AND unit <> ''
  AND responsibility IN (
    'soaking','cutting','post_cutting','sewing','finishing','ironing','quality_check'
  )
ON CONFLICT (stage, name) DO NOTHING;

-- ── 5. Link existing resources to their units ────────────────────────────
UPDATE resources r
SET unit_id = u.id
FROM units u
WHERE r.unit_id IS NULL
  AND r.responsibility = u.stage::text
  AND r.unit = u.name;

-- ── 6. Sync trigger: keep resources.unit text mirrored from units.name ───
-- Lets legacy readers (scheduler, PlanDialog, performance) keep working
-- while consumers migrate to joining through unit_id.
CREATE OR REPLACE FUNCTION sync_resource_unit_text()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.unit_id IS NULL THEN
    NEW.unit := NULL;
  ELSE
    SELECT name INTO NEW.unit FROM units WHERE id = NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resources_sync_unit_text ON resources;
CREATE TRIGGER resources_sync_unit_text
  BEFORE INSERT OR UPDATE OF unit_id ON resources
  FOR EACH ROW
  EXECUTE FUNCTION sync_resource_unit_text();

-- When a unit is renamed, propagate to all resource rows.
CREATE OR REPLACE FUNCTION sync_resource_unit_on_rename()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE resources SET unit = NEW.name WHERE unit_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS units_rename_syncs_resources ON units;
CREATE TRIGGER units_rename_syncs_resources
  AFTER UPDATE OF name ON units
  FOR EACH ROW
  EXECUTE FUNCTION sync_resource_unit_on_rename();

-- updated_at bump
CREATE OR REPLACE FUNCTION bump_units_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS units_bump_updated_at ON units;
CREATE TRIGGER units_bump_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW
  EXECUTE FUNCTION bump_units_updated_at();

-- ── 7. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "units_select" ON units;
CREATE POLICY "units_select" ON units FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "units_modify" ON units;
CREATE POLICY "units_modify" ON units FOR ALL USING (
  is_admin() OR (get_my_role() = 'manager' AND get_my_department() = 'workshop')
);
