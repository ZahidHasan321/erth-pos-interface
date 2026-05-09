-- Migration: drop measurements.collar_length.
--
-- Per spec ("MEASURES NAMING.pdf"), "Gallabiya Len" is merged into
-- "17. Collar Len" (= measurements.collar_width). The legacy collar_length
-- column was the gallabiya field and is no longer captured anywhere — POS
-- forms, alteration forms, and QC have been updated to use collar_width.
-- Existing data in collar_length is discarded (per user direction).

ALTER TABLE measurements
  DROP COLUMN IF EXISTS collar_length;
