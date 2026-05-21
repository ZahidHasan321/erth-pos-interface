-- 0015_orders_idempotency_key
--
-- Idempotent order creation. createOrder() is a plain PostgREST insert and is
-- NOT idempotent: if a network drop loses the response after the row committed
-- (Firefox/HTTP-3 QUIC flakiness against the Supabase Cloudflare edge), a retry
-- or manual re-click would insert a duplicate order.
--
-- The client now stamps a UUID on the order. A partial unique index makes a
-- replay collide (23505) instead of duplicating; the app recovers the original
-- row by that key. Same pattern as payment_transactions.idempotency_key.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- Partial unique index — only enforces uniqueness when key is provided, so
-- pre-existing rows (NULL key) coexist and new submits get dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
