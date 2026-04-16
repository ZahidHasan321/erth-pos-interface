-- Migration: garment discarded terminal stage + replacement link
--
-- Adds the "discarded" piece_stage for redo outcomes (original garment is
-- killed, never reworked) and a self-FK column pointing at the replacement
-- garment. Unique index enforces at most one replacement per original.
--
-- no-transaction: ALTER TYPE ... ADD VALUE must run outside a transaction.

ALTER TYPE piece_stage ADD VALUE IF NOT EXISTS 'discarded';

ALTER TABLE garments
    ADD COLUMN IF NOT EXISTS replaced_by_garment_id uuid
    REFERENCES garments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS garments_replaced_by_unique
    ON garments(replaced_by_garment_id);
