# Write Idempotency Audit & Remediation Plan

**Why:** Firefox/HTTP-3 (QUIC) intermittently drops requests to the Supabase
Cloudflare edge: the preflight succeeds, the follow-up gets no response,
`fetch()` rejects with `TypeError`. The server may have already committed.
Any non-idempotent write is therefore exposed to **silent duplication or
numeric corruption** on the user's retry / re-click.

The generic fetch layer (`apps/*/src/lib/db.ts`) only auto-retries idempotent
GET/HEAD. Writes must be made individually replay-safe.

## Categories

| Category | Replay effect | Fix |
|---|---|---|
| Read (GET/HEAD) | none | fetch-layer retry (pos ✅, workshop ✗ → port) |
| Idempotent write (UPDATE by PK, converging RPC) | none | bounded `withWriteRetry` |
| Non-idempotent insert (entity) | duplicate row | `idempotency_key` col + partial unique index + stable client key + 23505 recovery |
| Accumulating RPC (`stock ± qty`, counters, append) | **silent corruption** | server-enforced idempotency via `rpc_idempotency` |

## RPC remediation (highest risk — touches stock/cash)

Generic mechanism: new table `rpc_idempotency(idempotency_key uuid pk,
rpc_name text, result jsonb, created_at)` + `idem_check()/idem_store()`
helpers. Each mutating RPC gains `p_idempotency_key uuid default null`;
on entry returns the cached result if the key was already processed,
stores the result before returning.

| RPC | Verdict | Action |
|---|---|---|
| restock_item | CORRUPTS | guard |
| consume_for_order | CORRUPTS | guard |
| complete_work_order | CORRUPTS (shelf/fabric stock) | guard |
| complete_sales_order | CORRUPTS (shelf stock) | guard |
| dispatch_transfer | CORRUPTS (source stock) | guard |
| direct_send_transfer | CORRUPTS + DUP | guard |
| direct_send_transfers_batch | CORRUPTS + DUP | guard |
| create_complete_sales_order | DUP order + payment | guard |
| create_transfer_requests_batch | DUP requests | guard |
| close_register | DUP close events | guard |
| receive_transfer | partial per-item guard | add txn-level guard |
| record_payment_transaction | SAFE *iff key passed* | ensure all callers pass key |
| adjust_stock / save_work_order_garments / toggle_home_delivery / collect_garments / update_order_discount | SAFE (absolute/converging) | `withWriteRetry` only |

## Entity inserts needing idempotency_key column

orders ✅ (done) · measurements (pos `createMeasurement`, workshop
`createMeasurement`/`cloneMeasurement`) · customers · appointments ·
garment_feedback · alteration flow (orders+alteration_orders+garments) ·
transfer_requests/+items (createTransferRequest, reviseTransferRequest).

Catalog creates (fabrics/shelf/accessories/suppliers/units/resources/styles/
style_pricing_rules): low risk (duplicate is visible & deletable) — keyed in
the final wave.

`dispatch_log` inserts are best-effort fire-and-forget logs (callers already
ignore failure); duplicate log rows do not corrupt state — **out of scope**.

## Idempotent writes → just need retry

All UPDATE-by-PK (`update*`, archive/unarchive, soft-delete fallbacks),
upserts (work_orders, customers upsert), status-guarded deletes, and the
converging RPCs above. Wrapped in `withWriteRetry` (replay-safe by nature).

## Execution waves

1. **Infra**: `rpc_idempotency` table + helpers; port retry layer to workshop; shared `withWriteRetry`.
2. **Wave 1 (corruption)**: guard all CORRUPTS/DUP RPCs; wire every caller in both apps to send a stable key + retry.
3. **Wave 2 (visible dup)**: idempotency_key columns + client keys for entity inserts.
4. **Wave 3 (polish)**: `withWriteRetry` on idempotent writes; catalog-create keys.

Migration files: table + columns under `packages/database/migrations/`.
RPC bodies live in `packages/database/src/triggers.sql` (re-applied by
`pnpm --filter @repo/database db:triggers`); column/table DDL applied by
`pnpm --filter @repo/database db:migrate`.

---

## STATUS (live)

**DONE (code complete, type-verified, applied + tested against live DB
on 2026-05-17 — migration 0016 + `triggers.sql` are live; `db:test-idempotency`
= 13/13 pass: dedupe-once, distinct/NULL key, rollback-releases-claim, and
result-replay returns the REAL payload not a stub, via restock_item +
consume_for_order + the idem_claim/store/replay triad. Other 10 guarded
RPCs share that proven triad; their per-RPC fixtures deferred):**
- Infra: `rpc_idempotency` table (schema + migration 0016, has `result JSONB`),
  `idem_claim()` / `idem_store()` / `idem_replay()` helpers, `orders.idempotency_key`
  (migration 0015).
- **Result-replay (M1/M2) complete for all 12 guarded RPCs**: each does
  `IF NOT idem_claim(...) THEN RETURN idem_replay(...); END IF;`, captures its
  real payload into `v_result`, `PERFORM idem_store(p_idempotency_key, v_result)`,
  then `RETURN v_result`. 12 claims / 12 stores / 12 replays — symmetric.
  Guarded: complete_work_order, complete_sales_order, create_complete_sales_order,
  close_register, add_cash_movement, dispatch_transfer, receive_transfer,
  restock_item, consume_for_order, direct_send_transfer,
  create_transfer_requests_batch, direct_send_transfers_batch.
  (`record_payment_transaction` keeps its own bespoke full-result inline replay.)
- `add_cash_movement` (M3) guarded server-side + caller wired.
- Transport parity: both apps' `lib/db.ts` have idempotent-method retry +
  `isTransientNetworkError` + exported `withWriteRetry` (`() => PromiseLike<T>`).
- `check-types` is genuine `tsc -b` in BOTH apps (was a no-op `tsc --noEmit`
  under solution-style tsconfig — false green; fixed pos + workshop).
- **All callers wired**: `createOrder`, `saveWorkOrderGarments` (keyless
  converging), pos `restockItem`/`adjustStock`/`consumeForOrder`,
  `recordPaymentTransaction` (callers generate stable key); + this pass:
  pos `completeWorkOrder`/`completeSalesOrder`/`createCompleteSalesOrder`,
  pos `closeRegister`/`addCashMovement`, pos + workshop transfers
  (dispatchTransfer, receiveTransfer, createTransferRequestsBatch,
  directSendTransfer, directSendTransfersBatch), workshop
  `restockItem` (keyed) / `adjustStock` (keyless converging).
  Verified: `pnpm --filter pos-interface check-types` and
  `pnpm --filter workshop check-types` both exit 0 (forced full rebuild).

**CRITICAL CAVEAT:** a guarded RPC only dedupes when the caller passes
`p_idempotency_key`. With NULL it behaves exactly as before (no regression,
but no protection). All corruption-risk callers now pass a key (above).

**WAVE 2 — DONE (live 2026-05-17, migration 0017):** `idempotency_key`
UUID + NULL-filtered partial unique index on measurements, customers,
appointments, garment_feedback, alteration_orders, transfer_requests
(schema.ts + migration 0017, applied directly to prod — the `db:migrate`
runner's bookkeeping was never used for this DB so it can't be used here;
0017 is fully `IF NOT EXISTS` idempotent). Columns + all 6 indexes verified
present in prod. All entity-create callers rewritten to the proven
`createOrder` keyed-insert-+-23505-recovery loop:
- pos: createMeasurement, createCustomer, createAppointment, createFeedback;
  multi-table createTransferRequest/reviseTransferRequest and
  createAlterationOrder key only the parent row, recover-and-return without
  re-inserting children (same accepted bar as createOrder→work_orders).
- workshop: createMeasurement, cloneMeasurement, createTransferRequest,
  reviseTransferRequest (same parent-key pattern).

**WAVE 3 — DONE (retry-wrapping; no DB change):** ~35 idempotent
UPDATE-by-PK / upsert / status-guarded-delete call sites across both apps'
`src/api/*` wrapped in `withWriteRetry`. Correctly EXCLUDED non-converging
writes: `dispatchGarmentToWorkshop` (trip_number increment), entity inserts,
and trip_history-append loops. Catalog-create keying intentionally SKIPPED
per scope decision (duplicate fabric/unit/etc. is visible & deletable —
low value, avoids schema churn on 8 more tables).

Both apps type-clean under forced `tsc -b` (exit 0); db `db:test-idempotency`
13/13 (no Wave 1 regression after 0017 + all code changes).

**STILL NOT DONE (deliberately deferred, low value):**
- Per-RPC integration fixtures for the other 10 guarded RPCs — they share
  the guard triad already proven live; registers/work-orders/transfer-chain
  fixtures deferred.
- `open_register` unguarded (duplicate open session is visible & reversible).
- Catalog-create idempotency keys (above).
- Wave 2 has no dedicated automated test: each rewrite is line-for-line the
  `createOrder`/0015 pattern, whose live test is the accepted verification bar.
