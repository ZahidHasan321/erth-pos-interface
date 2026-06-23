-- 0034: stock-purchase payables + weighted-average cost (SPEC §3 cashier
-- "Stock-purchase settlement", §4 inventory "Cost basis & purchases").
--
-- Until now a restock silently added stock with an optional unit_cost stamped on
-- the movement, and no money trail existed: buying fabric/shelf never produced a
-- payable the cashier had to settle, and the item carried no cost basis distinct
-- from its selling price. This migration adds:
--   1. avg_cost (WAC) on fabrics + shelf — a true cost basis, maintained by
--      restock_item (triggers.sql), separate from price_per_meter / price.
--   2. stock_purchases — one payable per shop fabric/shelf restock (the expense),
--      created UNPAID, linked to the originating stock_movement.
--   3. stock_purchase_payments — the settlement ledger; a trigger sums it into
--      stock_purchases.amount_paid / status (mirrors sync_order_paid).
-- All DDL is idempotent (IF NOT EXISTS / DO-guarded CREATE TYPE), safe to re-run.
-- After this, apply triggers (db:triggers) for restock_item's WAC+payable logic,
-- the sync trigger, pay_stock_purchase, get_stock_purchases, and RLS.

-- 1. WAC cost basis on the two shop-only item families.
ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(10,3);
ALTER TABLE shelf   ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(10,3);

-- 2. Enums (fresh types — no ALTER TYPE ADD VALUE, so no in-txn-use hazard).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_purchase_status') THEN
    CREATE TYPE stock_purchase_status AS ENUM ('unpaid', 'partially_paid', 'paid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_payment_type') THEN
    CREATE TYPE purchase_payment_type AS ENUM ('cash', 'knet', 'link_payment', 'bank_transfer', 'others');
  END IF;
END $$;

-- 3. The payable: one row per costed shop fabric/shelf restock.
CREATE TABLE IF NOT EXISTS stock_purchases (
  id                 SERIAL PRIMARY KEY,
  item_type          stock_item_type NOT NULL,
  item_id            INTEGER NOT NULL,
  location           stock_location NOT NULL DEFAULT 'shop',
  brand              brand NOT NULL DEFAULT 'ERTH',
  qty                NUMERIC(10,2) NOT NULL,
  unit_cost          NUMERIC(10,3) NOT NULL,
  total_cost         NUMERIC(10,3) NOT NULL,           -- qty * unit_cost, frozen at purchase
  supplier_id        INTEGER REFERENCES suppliers(id),
  invoice_image_url  TEXT,
  stock_movement_id  INTEGER REFERENCES stock_movements(id),
  amount_paid        NUMERIC(10,3) NOT NULL DEFAULT 0, -- maintained by sync trigger
  status             stock_purchase_status NOT NULL DEFAULT 'unpaid', -- maintained by sync trigger
  notes              TEXT,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMP DEFAULT now(),
  -- The originating restock's idempotency key (traceability only; the restock
  -- RPC already dedupes, so the purchase can't be created twice).
  idempotency_key    UUID,
  CONSTRAINT stock_purchases_qty_positive CHECK (qty > 0),
  CONSTRAINT stock_purchases_total_nonneg CHECK (total_cost >= 0),
  CONSTRAINT stock_purchases_paid_nonneg  CHECK (amount_paid >= 0)
);
CREATE INDEX IF NOT EXISTS stock_purchases_status_idx ON stock_purchases (brand, status);
CREATE INDEX IF NOT EXISTS stock_purchases_item_idx   ON stock_purchases (item_type, item_id);
CREATE INDEX IF NOT EXISTS stock_purchases_created_idx ON stock_purchases (created_at);

-- 4. The settlement ledger. A trigger rolls this up into stock_purchases.
CREATE TABLE IF NOT EXISTS stock_purchase_payments (
  id                        SERIAL PRIMARY KEY,
  purchase_id               INTEGER NOT NULL REFERENCES stock_purchases(id) ON DELETE CASCADE,
  amount                    NUMERIC(10,3) NOT NULL,
  payment_type              purchase_payment_type NOT NULL,
  -- Cash settlements post a cash_out drawer movement so they reconcile at EOD;
  -- non-cash settlements (knet/link/bank) leave these NULL.
  register_session_id       INTEGER REFERENCES register_sessions(id),
  register_cash_movement_id INTEGER REFERENCES register_cash_movements(id),
  payment_ref_no            TEXT,
  note                      TEXT,
  paid_by                   UUID REFERENCES users(id),
  paid_at                   TIMESTAMP DEFAULT now(),
  idempotency_key           UUID,
  CONSTRAINT stock_purchase_payments_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS stock_purchase_payments_purchase_idx ON stock_purchase_payments (purchase_id);
CREATE UNIQUE INDEX IF NOT EXISTS stock_purchase_payments_idempotency_key_idx
  ON stock_purchase_payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM stock_purchases;
  RAISE NOTICE '0034: stock_purchases ready (% existing rows); avg_cost columns added to fabrics/shelf.', v_n;
END $$;
