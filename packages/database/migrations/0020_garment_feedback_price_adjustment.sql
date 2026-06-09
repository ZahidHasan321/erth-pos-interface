-- 0020_garment_feedback_price_adjustment
--
-- Brova-trial per-final style reprice audit (SPEC §2.5). When a style change at
-- the brova trial moves the order total, the brova's garment_feedback row carries
-- an audit blob: { order_id, old/new order_total, delta, old/new style_charge,
-- per_garment:[{garment_id, old_snapshot, new_snapshot}], actor, reason, applied_at }.
--
-- Audit-only — never gates anything. Nullable, no backfill (historical feedback
-- rows pre-date repricing).

ALTER TABLE garment_feedback
  ADD COLUMN IF NOT EXISTS price_adjustment JSONB;
