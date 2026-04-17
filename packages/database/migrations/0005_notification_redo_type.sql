-- Migration: add 'garment_redo_requested' to notification_type enum.
--
-- Used by the notify_garment_redo_requested() trigger (packages/database/src/triggers.sql)
-- to fire an URGENT notification at workshop when a shop user marks a garment
-- needs_redo on the feedback page. The original is discarded; workshop must spin
-- a replacement immediately, so the toast is styled red and requires an
-- explicit acknowledge click on the workshop side.
--
-- no-transaction: ALTER TYPE ... ADD VALUE must run outside a transaction.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'garment_redo_requested';
