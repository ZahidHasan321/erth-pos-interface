-- 0031_sheet2_pricing_update
--
-- Pricing update from the stakeholder "Interface Pages" workbook (Sheet2 option
-- list). Applied to ALL brands (ERTH, SAKKBA, QASS) per stakeholder direction.
--
-- Only two values change vs. the live DB; every other Sheet2-priced option
-- (soaking, cuffs, zipper, jabzour interlining) already matched.
--   * Express surcharge:            3 -> 5  (prices.EXPRESS_SURCHARGE)
--   * Qallabi collar (flat style):  5 -> 3  (styles.rate_per_item + the
--                                            style_pricing_rules flat_override)
--
-- Designer model (STY_DESIGNER) is deliberately LEFT at its existing 6 KD flat
-- per stakeholder direction, even though Sheet2 lists 15 — do not change it here.
--
-- Qallabi is a flat_override style: the order-pricing engine reads
-- style_pricing_rules.flat_rate (falling back to rate_per_item only when null),
-- so BOTH columns are updated to keep them in lock-step. This is a forward-only
-- price change — existing orders keep their snapshotted charges and do not
-- re-price. Idempotent: plain UPDATEs, safe to re-run.

-- 1. Express surcharge -> 5 KD (all brands)
UPDATE prices
SET value = 5.000, updated_at = now()
WHERE key = 'EXPRESS_SURCHARGE';

-- 2. Qallabi collar flat rate -> 3 KD (all brands)
UPDATE styles
SET rate_per_item = 3.000
WHERE code = 'COL_QALLABI';

UPDATE style_pricing_rules
SET flat_rate = 3.000, updated_at = now()
WHERE style_code = 'COL_QALLABI' AND rule_type = 'flat_override';
