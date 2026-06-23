-- 0033: explicit Primary<-Secondary customer link (SPEC §5 "Customer accounts").
-- Until now a Secondary account was tied to its Primary only by an identical
-- phone string (re-derived at runtime, exact-match, primary-only) — brittle and
-- it broke the moment two family members had different numbers. This adds a real
-- foreign key so the link is stored, independent of phone, and best-effort
-- backfills existing Secondaries by their normalized phone. Idempotent.

-- 1. The link column: a Secondary -> its Primary. Self-reference; if a primary
--    row is ever deleted the link is cleared rather than blocking the delete.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS primary_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;

-- 2. Lookup index (secondaries of a given primary). Partial: only linked rows.
CREATE INDEX IF NOT EXISTS customers_primary_customer_id_idx
  ON customers (primary_customer_id)
  WHERE primary_customer_id IS NOT NULL;

-- 3. Best-effort backfill: link each still-unlinked Secondary to the single
--    Primary that shares its normalized national number. 0 or >1 matches (or a
--    blank phone) are left NULL for a manual pass — never guessed. Re-running is
--    a no-op (only touches rows still NULL). normalize_phone() is the same
--    helper the search RPCs use (triggers.sql).
WITH matches AS (
  SELECT s.id AS sec_id,
         (ARRAY_AGG(p.id ORDER BY p.id))[1] AS primary_id,
         COUNT(*) AS match_count
  FROM customers s
  JOIN customers p
    ON p.account_type = 'Primary'
   AND p.id <> s.id
   AND normalize_phone(p.phone) = normalize_phone(s.phone)
  WHERE s.account_type = 'Secondary'
    AND s.primary_customer_id IS NULL
    AND COALESCE(normalize_phone(s.phone), '') <> ''
  GROUP BY s.id
)
UPDATE customers s
SET primary_customer_id = m.primary_id
FROM matches m
WHERE s.id = m.sec_id
  AND m.match_count = 1;

-- 4. Invariant: Secondary <=> has a linked primary; Primary/NULL type have none.
--    Added NOT VALID so any Secondary that could not be auto-linked above does
--    not block this migration; it is enforced on every future insert/update, and
--    the app now requires a primary for a Secondary so those rows get fixed on
--    their next edit. (NULL account_type rows make the expression NULL = pass.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_secondary_requires_primary'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_secondary_requires_primary
      CHECK ((account_type = 'Secondary') = (primary_customer_id IS NOT NULL))
      NOT VALID;
  END IF;
END $$;

-- 5. Surface what could not be auto-linked (manual one-time cleanup).
DO $$
DECLARE
  v_unlinked INT;
BEGIN
  SELECT COUNT(*) INTO v_unlinked
  FROM customers
  WHERE account_type = 'Secondary' AND primary_customer_id IS NULL;
  RAISE NOTICE '0033: % Secondary account(s) left unlinked (no single normalized-phone Primary match) - fix manually.', v_unlinked;
END $$;
