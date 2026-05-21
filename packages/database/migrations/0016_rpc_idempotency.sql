-- 0016_rpc_idempotency
--
-- Server-enforced idempotency for mutating RPCs. The Firefox/HTTP-3 QUIC drop
-- (see 0015 + WRITE_IDEMPOTENCY_AUDIT.md) can lose an RPC's response after it
-- committed. For accumulating RPCs (stock = stock ± qty) or entity-creating
-- RPCs, the client's retry would double-apply / duplicate.
--
-- Mechanism: the client passes a stable UUID. idem_claim() (see triggers.sql)
-- INSERTs it in the SAME transaction as the RPC body. First call: row
-- inserted, RPC proceeds. Replay: ON CONFLICT DO NOTHING → claim returns
-- false → RPC short-circuits without re-running side effects. If the RPC
-- raises, the transaction (and the claim) rolls back, so a real failure is
-- still retryable.
--
-- Apply order: db:migrate (this) BEFORE db:triggers (idem_claim + guarded RPCs).

CREATE TABLE IF NOT EXISTS rpc_idempotency (
  idempotency_key UUID PRIMARY KEY,
  rpc_name        TEXT NOT NULL,
  result          JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rpc_idempotency_created_at_idx
  ON rpc_idempotency(created_at);
