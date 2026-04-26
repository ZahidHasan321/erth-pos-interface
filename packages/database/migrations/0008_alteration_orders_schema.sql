-- Migration: alteration-orders schema additions.
--
-- Adds:
--   • garment_type enum value 'alteration'  → tag garments belonging to ALTERATION orders
--   • measurements columns                  → 9 new fields surfaced by the
--                                             alteration form (collar_length,
--                                             second_button_distance, basma_*,
--                                             *_hemming, pen_pocket_*)
--   • garments.alteration_styles            → sparse style overrides (jsonb)
--   • garments.full_measurement_set_id      → FK to measurements; populated in
--                                             full_set mode (cashier picked an
--                                             existing measurement set)
--   • garments.original_garment_id          → optional self-FK back to the
--                                             garment being altered, for form
--                                             seeding
--
-- All adds are idempotent (IF NOT EXISTS) so this is safe to run on databases
-- that already received these columns via `db:push`.
--
-- no-transaction: ALTER TYPE ... ADD VALUE must run outside a transaction.

ALTER TYPE garment_type ADD VALUE IF NOT EXISTS 'alteration';

-- ── measurements: alteration-form fields ──────────────────────────────────────
ALTER TABLE measurements
  ADD COLUMN IF NOT EXISTS collar_length            numeric(5,2),
  ADD COLUMN IF NOT EXISTS second_button_distance   numeric(5,2),
  ADD COLUMN IF NOT EXISTS basma_length             numeric(5,2),
  ADD COLUMN IF NOT EXISTS basma_width              numeric(5,2),
  ADD COLUMN IF NOT EXISTS basma_sleeve_length      numeric(5,2),
  ADD COLUMN IF NOT EXISTS sleeve_hemming           numeric(5,2),
  ADD COLUMN IF NOT EXISTS bottom_hemming           numeric(5,2),
  ADD COLUMN IF NOT EXISTS pen_pocket_length        numeric(5,2),
  ADD COLUMN IF NOT EXISTS pen_pocket_width         numeric(5,2);

-- ── garments: alteration links ────────────────────────────────────────────────
ALTER TABLE garments
  ADD COLUMN IF NOT EXISTS alteration_styles        jsonb,
  ADD COLUMN IF NOT EXISTS full_measurement_set_id  uuid REFERENCES measurements(id),
  ADD COLUMN IF NOT EXISTS original_garment_id      uuid REFERENCES garments(id) ON DELETE SET NULL;
