-- 0039: Extend the shoulder_slope taxonomy with the LEFT SHOULDER values and an
-- explicit NONE.
--
-- Purely additive (no data change): the categorical body measurement gains the
-- left-only counterparts of the existing right-only values, plus an explicit
-- `none` ("no notable slope" — a real stored value, distinct from NULL and from
-- the *_straight values), bringing the set to ten. Existing rows are untouched.
-- The new values are positioned so the enum's internal sort order matches the
-- dropdown order (none / right / left / both), though UI ordering is driven by
-- SHOULDER_SLOPE_UI.
--
-- ALTER TYPE ... ADD VALUE is allowed outside a same-type-creating transaction
-- on PG 12+. IF NOT EXISTS makes a re-run (db built via db:push) a no-op.
ALTER TYPE shoulder_slope ADD VALUE IF NOT EXISTS 'none' BEFORE 'right_down';
ALTER TYPE shoulder_slope ADD VALUE IF NOT EXISTS 'left_down' AFTER 'right_straight';
ALTER TYPE shoulder_slope ADD VALUE IF NOT EXISTS 'left_up' AFTER 'left_down';
ALTER TYPE shoulder_slope ADD VALUE IF NOT EXISTS 'left_straight' AFTER 'left_up';
