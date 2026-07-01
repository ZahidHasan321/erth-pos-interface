-- Alteration cashier-processing gate (§3): alterations now flow through the
-- cashier like ERTH WORK orders. Mirror work_orders' gate marker onto
-- alteration_orders so a confirmed alteration is "pending cashier processing"
-- until a payment or confirm-without-payment sets it. That marker also gates
-- dispatch to the workshop (see dispatch_order in triggers.sql), giving
-- alterations full WORK-order parity at the cashier.
ALTER TABLE alteration_orders ADD COLUMN IF NOT EXISTS cashier_processed_at timestamptz;
ALTER TABLE alteration_orders ADD COLUMN IF NOT EXISTS cashier_processed_by uuid;
