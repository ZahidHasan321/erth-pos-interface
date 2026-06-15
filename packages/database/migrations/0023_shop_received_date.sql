-- shop_received_date: the date a garment is received back at the showroom from
-- the workshop (the transit_to_shop → shop "mark as received" step on the
-- receiving brova/final page). Surfaced in the orders-at-showroom table.
-- Idempotent: safe to re-run (DB is built via db:push; see memory notes).

ALTER TABLE garments ADD COLUMN IF NOT EXISTS shop_received_date timestamptz;

-- Stamp it on the transit_to_shop → shop transition. Re-stamps on each return
-- trip so the value reflects when the items currently on the floor arrived.
CREATE OR REPLACE FUNCTION stamp_shop_received_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location = 'shop' AND OLD.location = 'transit_to_shop' THEN
    NEW.shop_received_date := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS garment_shop_received_stamp ON garments;
CREATE TRIGGER garment_shop_received_stamp
  BEFORE UPDATE OF location ON garments
  FOR EACH ROW
  EXECUTE FUNCTION stamp_shop_received_date();
