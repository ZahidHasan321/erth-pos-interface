-- Migration: cashier safety hardening (audit findings #3, #4, #5, #11).
--
-- Adds:
--   • payment_transactions.register_session_id  → FK link cash to its session
--   • payment_transactions.idempotency_key      → dedupe accidental double-submits
--   • register_sessions.reopened_by/reopened_at → preserve audit on reopen
--   • garments.soaking_hours                    → 8/24h soaking duration
--   • CHECK constraints for non-negative cash amounts and valid soaking_hours
--
-- After this runs, re-apply triggers.sql so the RPCs populate the new columns.

-- ── garments: soaking duration column (referenced by CHECK constraint below) ──
ALTER TABLE garments
  ADD COLUMN IF NOT EXISTS soaking_hours INT;

-- ── payment_transactions: session FK + idempotency ────────────────────────────
-- ON DELETE RESTRICT (default, but explicit): cash transactions must outlive
-- their session row so reconciliation can never lose history to a stray delete.
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS register_session_id INT REFERENCES register_sessions(id) ON DELETE RESTRICT;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE INDEX IF NOT EXISTS payment_transactions_session_idx
  ON payment_transactions(register_session_id);

-- Partial unique index — only enforces uniqueness when key is provided.
-- Lets legacy rows (NULL key) coexist; new client-side submits get dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_idempotency_key_idx
  ON payment_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── register_sessions: preserve close info across reopens ─────────────────────
ALTER TABLE register_sessions
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES users(id);

ALTER TABLE register_sessions
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP;

-- ── CHECK constraints — defensive, server-side trust boundary ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'register_sessions_opening_float_nonneg'
  ) THEN
    ALTER TABLE register_sessions
      ADD CONSTRAINT register_sessions_opening_float_nonneg
      CHECK (opening_float >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'register_sessions_counted_cash_nonneg'
  ) THEN
    ALTER TABLE register_sessions
      ADD CONSTRAINT register_sessions_counted_cash_nonneg
      CHECK (closing_counted_cash IS NULL OR closing_counted_cash >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'register_cash_movements_amount_positive'
  ) THEN
    ALTER TABLE register_cash_movements
      ADD CONSTRAINT register_cash_movements_amount_positive
      CHECK (amount > 0);
  END IF;

  -- soaking_hours can only be 8 or 24 (or NULL when soaking is false).
  -- Pricing logic in apps fans out on this value; an unexpected number
  -- would silently mis-bill. Constrain at the column level.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'garments_soaking_hours_valid'
  ) THEN
    ALTER TABLE garments
      ADD CONSTRAINT garments_soaking_hours_valid
      CHECK (soaking_hours IS NULL OR soaking_hours IN (8, 24));
  END IF;

  -- reopened_by and reopened_at must be populated together. A row with one
  -- set and the other NULL would mean an audit trail half-lost during reopen.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'register_sessions_reopened_paired'
  ) THEN
    ALTER TABLE register_sessions
      ADD CONSTRAINT register_sessions_reopened_paired
      CHECK ((reopened_by IS NULL) = (reopened_at IS NULL));
  END IF;
END $$;
