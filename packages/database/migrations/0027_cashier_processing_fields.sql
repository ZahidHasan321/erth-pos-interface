-- Cashier processing gate (SPEC §3).
-- cashier_processed_at: timestamp a cashier first processed this WORK order
--   (confirm-without-payment OR first payment). While NULL the order is
--   "pending cashier processing" and dispatch_order rejects it. Set ONCE,
--   never cleared. The marker — not `paid` — is the dispatch gate, so a
--   confirmed-without-payment order (paid = 0) is dispatchable.
-- cashier_processed_by: the cashier (user) who processed it.
-- Lives on work_orders, so SALES/ALTERATION (no work_orders row) are never gated.
-- Idempotent: safe to re-run (DB is built via db:push; see memory notes).

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cashier_processed_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cashier_processed_by uuid REFERENCES users(id);

-- One-time backfill so existing WORK orders already past the gate are not
-- retro-blocked from (re-)dispatch. Mark processed (stamped at the order date)
-- every existing work order EXCEPT erth orders that are still genuinely pending
-- — confirmed, never dispatched (order_phase = 'new'), and unpaid — which
-- correctly enter the new cashier Pending queue. No-op on a fresh DB.
UPDATE work_orders w
SET cashier_processed_at = COALESCE(o.order_date, now())
FROM orders o
WHERE w.order_id = o.id
  AND w.cashier_processed_at IS NULL
  AND NOT (
    lower(o.brand::text) = 'erth'
    AND o.checkout_status = 'confirmed'
    AND w.order_phase = 'new'
    AND COALESCE(o.paid, 0) = 0
  );
