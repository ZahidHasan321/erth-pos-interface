-- 0055: enforce the SPEC §5 customer-account invariants in the database.
--
-- Until now NOTHING enforced them: customers had zero CHECK constraints live.
-- schema.ts even declares `customers_secondary_requires_primary`, but it was
-- never applied to the live DB (drift) -- so the only guard was the demographics
-- form, and a bug there was enough to produce a duplicate customer record.
--
-- The invariants (SPEC §5 "Customer accounts"):
--   1. account_type is always set (a blank type is what broke family-linking; 0053).
--   2. Secondary <=> carries a linked Primary.  Primary carries none.
--   3. Secondary <=> carries a relation.        Primary carries none.
--   4. Nobody links to themselves.
--   5. A Secondary links to a PRIMARY -- never to another Secondary. So the tree
--      is exactly one level deep: no chains, and therefore no cycles.
--
-- Verified against live data before writing: all eight probes clean, so these
-- apply as VALIDATED constraints (they hold for every existing row, not just
-- future ones). All statements are idempotent, safe to re-run.

-- 1. account_type is mandatory (0053 backfilled the legacy NULLs and set the default).
ALTER TABLE customers ALTER COLUMN account_type SET NOT NULL;

-- 2-4. Pairwise consistency + no self-link. Added via DO blocks because
--      ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_secondary_requires_primary') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_secondary_requires_primary
      CHECK ((account_type = 'Secondary') = (primary_customer_id IS NOT NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_secondary_requires_relation') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_secondary_requires_relation
      CHECK ((account_type = 'Secondary') = (relation IS NOT NULL AND relation <> ''));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_primary_link_not_self') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_primary_link_not_self
      CHECK (primary_customer_id IS NULL OR primary_customer_id <> id);
  END IF;
END $$;

-- 5. Depth-one family tree. A CHECK cannot look at another row, so this is a
--    trigger. Two rules, and together they make a chain (and thus a cycle)
--    unreachable: you cannot point at a non-Primary, and you cannot stop being a
--    Primary while anyone points at you.
CREATE OR REPLACE FUNCTION customers_family_link_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_target_type account_type;
BEGIN
  IF NEW.primary_customer_id IS NOT NULL THEN
    SELECT account_type INTO v_target_type
    FROM customers WHERE id = NEW.primary_customer_id;

    IF v_target_type IS NULL THEN
      RAISE EXCEPTION 'Cannot link customer % to primary account %: that account does not exist',
        COALESCE(NEW.id, 0), NEW.primary_customer_id;
    END IF;

    IF v_target_type <> 'Primary' THEN
      RAISE EXCEPTION 'Cannot link customer % to account %: that account is a Secondary, not a Primary. Link to the family''s primary account instead',
        COALESCE(NEW.id, 0), NEW.primary_customer_id;
    END IF;
  END IF;

  IF NEW.account_type = 'Secondary'
     AND EXISTS (SELECT 1 FROM customers WHERE primary_customer_id = NEW.id) THEN
    RAISE EXCEPTION 'Cannot make customer % a Secondary: other customers are linked to it as their primary account. Move them to another primary first',
      NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_family_link_guard_trg ON customers;
CREATE TRIGGER customers_family_link_guard_trg
  BEFORE INSERT OR UPDATE OF account_type, primary_customer_id ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_family_link_guard();
