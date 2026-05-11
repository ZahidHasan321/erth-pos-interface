-- Migration: convert accessories.category from enum to free-text.
--
-- Stakeholders need to add new categories inline (typed in the
-- create/edit dialog) instead of asking an engineer to ALTER TYPE.
-- Existing rows keep their current text value; we drop the unique
-- (name, category) index and recreate it because Postgres can't
-- change the column type while it's part of an index.

ALTER TABLE accessories DROP CONSTRAINT IF EXISTS accessories_name_category_idx;
DROP INDEX IF EXISTS accessories_name_category_idx;

ALTER TABLE accessories
  ALTER COLUMN category TYPE text USING category::text;

DROP TYPE IF EXISTS accessory_category;

CREATE UNIQUE INDEX accessories_name_category_idx
  ON accessories (name, category);
