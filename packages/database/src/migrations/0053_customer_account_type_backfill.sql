-- 0053: normalize legacy customers.account_type and make family-linking
-- NULL-tolerant (SPEC §5 "Customer accounts").
--
-- The Airtable import created ~1843 customers with account_type IS NULL. The
-- demographics form displays a blank type as "Primary" (mapper coalesces), but
-- the linking logic only ever recognised the literal 'Primary' as a valid link
-- target, so a legacy blank account could NOT be picked as a family head: staff
-- hit "That account has no primary on file" and could not turn a same-phone
-- sibling into a Secondary. This migration makes the stored value match the
-- displayed one, defaults future rows, and makes the lookup RPC NULL-tolerant.
-- All statements are idempotent (NULL-only UPDATE / SET DEFAULT / CREATE OR
-- REPLACE), safe to re-run.

-- 1. Backfill: an account with no explicit type is a standalone Primary.
--    (Verified: every NULL row has primary_customer_id IS NULL, so none is a
--    mis-imported Secondary.)
UPDATE customers SET account_type = 'Primary' WHERE account_type IS NULL;

-- 2. Default future inserts that omit the type to Primary. The shop form already
--    sends an explicit 'Primary', but a re-import must not reintroduce NULL.
ALTER TABLE customers ALTER COLUMN account_type SET DEFAULT 'Primary';

-- 3. Make the duplicate-phone lookup NULL-tolerant. Only an explicitly-linked
--    Secondary points elsewhere; a Primary OR a legacy blank resolves to ITSELF,
--    so it can be offered as "link as family member of X". (Kept in sync with
--    triggers.sql 15b.)
CREATE OR REPLACE FUNCTION find_accounts_by_phone(p_phone TEXT)
RETURNS JSONB AS $$
DECLARE
  v_nat TEXT := normalize_phone(p_phone);
  v_result JSONB;
BEGIN
  IF v_nat = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT c.id,
           c.name,
           c.phone,
           c.account_type,
           c.primary_customer_id,
           (CASE WHEN c.account_type = 'Secondary' AND c.primary_customer_id IS NOT NULL
                 THEN c.primary_customer_id ELSE c.id END) AS resolved_primary_id,
           p.name AS resolved_primary_name
    FROM customers c
    LEFT JOIN customers p
      ON p.id = (CASE WHEN c.account_type = 'Secondary' AND c.primary_customer_id IS NOT NULL
                      THEN c.primary_customer_id ELSE c.id END)
    WHERE normalize_phone(c.phone) = v_nat
    ORDER BY (c.account_type IS DISTINCT FROM 'Secondary') DESC, c.id ASC
  ) sub;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
