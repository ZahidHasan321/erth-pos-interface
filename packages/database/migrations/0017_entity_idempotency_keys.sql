-- 0017_entity_idempotency_keys
--
-- Wave 2 of the write-idempotency hardening (see WRITE_IDEMPOTENCY_AUDIT.md).
-- Wave 1 (0015 orders, 0016 RPCs) covered corruption-risk writes. These six
-- tables are plain PostgREST inserts: a Firefox/HTTP-3 QUIC drop that loses
-- the response after the row committed makes a retry / re-click duplicate the
-- entity. Same fix as orders (0015): client stamps a stable UUID, a partial
-- unique index turns a replay into a 23505 the app recovers from.
--
-- Additive only: nullable column + NULL-filtered unique index. Existing rows
-- (NULL key) are untouched and continue to coexist.

ALTER TABLE measurements       ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE customers          ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE appointments       ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE garment_feedback   ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE alteration_orders  ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE transfer_requests  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS measurements_idempotency_key_idx
  ON measurements(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_idempotency_key_idx
  ON customers(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_idempotency_key_idx
  ON appointments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS garment_feedback_idempotency_key_idx
  ON garment_feedback(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alteration_orders_idempotency_key_idx
  ON alteration_orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transfer_requests_idempotency_key_idx
  ON transfer_requests(idempotency_key) WHERE idempotency_key IS NOT NULL;
