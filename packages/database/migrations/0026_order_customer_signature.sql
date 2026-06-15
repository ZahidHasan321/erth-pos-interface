-- customer_signature_url: the customer's drawn signature captured at the
-- fabric-selection step of a work order. Printed on the order invoice (main
-- signature panel + the customer-copy tear-off). Stored as a storage URL (the
-- PNG lives in the media bucket) so list queries that select * stay lean.
-- Order-level: one signature per order.
-- Idempotent: safe to re-run (DB is built via db:push; see memory notes).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_signature_url text;
