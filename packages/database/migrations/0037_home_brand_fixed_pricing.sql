-- 0037_home_brand_fixed_pricing
--
-- Home-based brands (SAKKBA, QASS) price a GARMENT at a FIXED total that depends
-- only on style option (Kuwaiti vs Designer) and adult vs kid (SPEC §1/§5):
--
--      Adult Kuwaiti 15 | Adult Designer 25 | Kid Kuwaiti 12 | Kid Designer 22  (KD)
--
-- This is the stitching + style total with fabric folded in; home delivery and
-- express are SEPARATE and stack on top through the normal engine, matching ERTH
-- (HOME_DELIVERY 2, EXPRESS_SURCHARGE 5).
--
-- The matrix is NOT a new engine. It decomposes into the existing primitives:
--   * kid/adult delta (3 KD)        -> per-brand STITCHING rate (adult 9 / kid 6)
--   * Kuwaiti/Designer delta (10 KD)-> flat-override styles (Kuwaiti 6 / Designer 16)
-- Flat-override styles wipe every other style option to 0, so the garment total
-- depends only on the style option. Fabric is folded in (charged 0 to the
-- customer; the app zeroes the fabric line for home brands).
--
-- ERTH is deliberately untouched (additive pricing, its own stitching/style rates).
-- Scoped to brand IN ('SAKKBA','QASS'). Idempotent: plain UPDATEs + an UPSERT.

-- 1. Stitching rates (carries the kid/adult axis): adult 9, kid 6
UPDATE prices SET value = 9.000, updated_at = now()
WHERE key = 'STITCHING_ADULT' AND brand IN ('SAKKBA', 'QASS');

UPDATE prices SET value = 6.000, updated_at = now()
WHERE key = 'STITCHING_CHILD' AND brand IN ('SAKKBA', 'QASS');

-- 2. Designer flat style -> 16 KD (rate_per_item + rule flat_rate kept in lock-step;
--    the engine reads flat_rate, falling back to rate_per_item only when null)
UPDATE styles SET rate_per_item = 16.000
WHERE code = 'STY_DESIGNER' AND brand IN ('SAKKBA', 'QASS');

UPDATE style_pricing_rules SET flat_rate = 16.000, active = true, updated_at = now()
WHERE style_code = 'STY_DESIGNER' AND rule_type = 'flat_override'
  AND brand IN ('SAKKBA', 'QASS');

-- 3. Kuwaiti becomes a flat style -> 6 KD (was the additive base at 0). Making it a
--    flat override means collar/cuffs/pockets/etc. add nothing on home brands.
UPDATE styles SET rate_per_item = 6.000
WHERE code = 'STY_KUWAITI' AND brand IN ('SAKKBA', 'QASS');

INSERT INTO style_pricing_rules (brand, style_code, rule_type, flat_rate, priority, active, description)
SELECT b.brand, 'STY_KUWAITI', 'flat_override'::style_rule_type, 6.000, 0, true,
       'Kuwaiti style (home-based brand): flat rate, overrides all style options'
FROM (VALUES ('SAKKBA'), ('QASS')) AS b(brand)
ON CONFLICT (brand, style_code, priority)
DO UPDATE SET rule_type = 'flat_override', flat_rate = 6.000, active = true, updated_at = now();

-- 4. Home delivery + express surcharge match ERTH (added on top of the garment
--    matrix, not folded in). HOME_DELIVERY 2, EXPRESS_SURCHARGE 5.
UPDATE prices SET value = 2.000, updated_at = now()
WHERE key = 'HOME_DELIVERY' AND brand IN ('SAKKBA', 'QASS');

UPDATE prices SET value = 5.000, updated_at = now()
WHERE key = 'EXPRESS_SURCHARGE' AND brand IN ('SAKKBA', 'QASS');
