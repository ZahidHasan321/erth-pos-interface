-- Migration: add garments.soaking_started_at.
--
-- Soak bath is now started manually from the soak terminal. Staff multi-
-- selects pending soak garments and hits "Start Soak", which stamps a
-- shared timestamp on the batch. Mark Done (existing) continues to set
-- soaking_completed_at separately. Both actions stay manual.
--
-- Existing soaking garments at deploy time have NULL here; the terminal
-- treats them as pending (not yet started) and staff can start them as
-- a fresh batch. No backfill needed.

ALTER TABLE garments
  ADD COLUMN IF NOT EXISTS soaking_started_at timestamptz;
