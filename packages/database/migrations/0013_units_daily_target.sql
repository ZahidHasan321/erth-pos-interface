-- Migration: add daily_target to units
--
-- WHY
--   Sewing is unit-scoped: garments are assigned to a unit, any member acts on
--   them. Individual sewer KPIs aren't tracked — the unit's collective output
--   is. Storing daily_target on units (not just resources) makes the unit a
--   first-class KPI target.
--
--   For non-sewing stages this column is unused today but harmless — future
--   stages may want unit-level capacity.
--
-- SAFE TO REPLAY: ADD COLUMN IF NOT EXISTS.

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS daily_target integer;
