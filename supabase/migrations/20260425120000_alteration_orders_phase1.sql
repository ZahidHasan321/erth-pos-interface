-- Alteration Order plan, Phase 1.
-- 1) Add 'alteration' to garment_type enum.
-- 2) Add columns to garments for the new multi-step alteration flow:
--    - original_garment_id (link to a prior garment being altered, optional)
--    - full_measurement_set_id (FK → measurements when full_set mode selected)
--    - alteration_styles (jsonb sparse style overrides for changes_only mode)
-- alteration_measurements and alteration_issues already exist; alteration_issues
-- is now deprecated but kept for legacy rows.

ALTER TYPE garment_type ADD VALUE IF NOT EXISTS 'alteration';

ALTER TABLE garments
    ADD COLUMN IF NOT EXISTS original_garment_id uuid REFERENCES garments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS full_measurement_set_id uuid REFERENCES measurements(id),
    ADD COLUMN IF NOT EXISTS alteration_styles jsonb;
