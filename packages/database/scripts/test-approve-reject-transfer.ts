/**
 * Isolated tests for the new approve_transfer / reject_transfer RPCs
 * (migration 0018). Proves the three properties the old raw PostgREST
 * updates lacked:
 *   - status guard: only a still-'requested' transfer can be approved or
 *     rejected (no re-approving a dispatched transfer → no double decrement).
 *   - atomic per-item + header: approved_qty and status move together.
 *   - idempotency: a replay with the same key is a no-op returning the
 *     original payload (lost-response retry safe).
 *
 * Self-contained: builds throwaway transfer fixtures, asserts, cleans up.
 *
 * Usage: npx tsx scripts/test-approve-reject-transfer.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import { randomUUID } from "crypto";

dotenv.config();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} — ${detail}`); }
}
function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Expected a row from ${what}, got none`);
  return row;
}
async function expectThrow(fn: () => Promise<unknown>, contains: string, name: string) {
  try {
    await fn();
    check(name, false, `expected an exception containing "${contains}", none thrown`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(name, msg.includes(contains), `expected message containing "${contains}", got "${msg}"`);
  }
}

async function main() {
  const userRows = await sql<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
  const userId = one(userRows, "users lookup").id;

  const fabName = `__tr_test_${randomUUID()}`;
  const fabId = one(
    await sql<{ id: number }[]>`
      INSERT INTO fabrics (name, shop_stock, workshop_stock)
      VALUES (${fabName}, 100, 100) RETURNING id`,
    "fabric insert",
  ).id;

  const transferIds: number[] = [];
  const testKeys: string[] = [];

  // Fresh 'requested' transfer with one fabric line of requested_qty=5.
  async function mkTransfer(): Promise<{ tid: number; itemId: number }> {
    const tid = one(
      await sql<{ id: number }[]>`
        INSERT INTO transfer_requests (brand, direction, item_type, status, requested_by)
        VALUES ('ERTH', 'workshop_to_shop', 'fabric', 'requested', ${userId})
        RETURNING id`,
      "transfer insert",
    ).id;
    transferIds.push(tid);
    const itemId = one(
      await sql<{ id: number }[]>`
        INSERT INTO transfer_request_items (transfer_request_id, fabric_id, requested_qty)
        VALUES (${tid}, ${fabId}, 5) RETURNING id`,
      "transfer item insert",
    ).id;
    return { tid, itemId };
  }
  const status = async (tid: number) =>
    one(await sql<{ status: string }[]>`SELECT status FROM transfer_requests WHERE id = ${tid}`, "status").status;
  const approvedQty = async (itemId: number) =>
    Number(one(await sql<{ approved_qty: string | null }[]>`
      SELECT approved_qty FROM transfer_request_items WHERE id = ${itemId}`, "approved_qty").approved_qty);

  try {
    // ── 1. approve happy path ────────────────────────────────────────────
    {
      const { tid, itemId } = await mkTransfer();
      const k = randomUUID(); testKeys.push(k);
      const res = one(await sql<{ approve_transfer: { success?: boolean } }[]>`
        SELECT approve_transfer(${tid}, ${sql.json([{ id: itemId, approved_qty: 3 }])}, ${k}) AS approve_transfer`,
        "approve happy").approve_transfer;
      const row = one(await sql<{ status: string; approved_at: string | null }[]>`
        SELECT status, approved_at FROM transfer_requests WHERE id = ${tid}`, "row");
      check("approve: returns success",
        res.success === true, `got ${JSON.stringify(res)}`);
      check("approve: status → approved + approved_at set + approved_qty written",
        row.status === "approved" && row.approved_at != null && (await approvedQty(itemId)) === 3,
        `status=${row.status} approved_at=${row.approved_at} qty=${await approvedQty(itemId)}`);

      // ── 2. status guard: re-approve an already-approved transfer ───────
      await expectThrow(
        () => sql`SELECT approve_transfer(${tid}, ${sql.json([{ id: itemId, approved_qty: 9 }])}, ${randomUUID()})`,
        "not awaiting approval",
        "approve: status guard blocks re-approving a non-requested transfer",
      );
      check("approve: guarded re-approve did not mutate approved_qty",
        (await approvedQty(itemId)) === 3, `qty=${await approvedQty(itemId)}`);

      // ── 5. reject guard: reject an already-approved transfer ───────────
      await expectThrow(
        () => sql`SELECT reject_transfer(${tid}, 'too late', ${randomUUID()})`,
        "not awaiting approval",
        "reject: status guard blocks rejecting a non-requested transfer",
      );
      check("reject: guarded reject left status approved",
        (await status(tid)) === "approved", `status=${await status(tid)}`);
    }

    // ── 3. idempotency: same key replay is a no-op ───────────────────────
    {
      const { tid, itemId } = await mkTransfer();
      const k = randomUUID(); testKeys.push(k);
      await sql`SELECT approve_transfer(${tid}, ${sql.json([{ id: itemId, approved_qty: 4 }])}, ${k})`;
      // Replay with the SAME key but different qty — must be ignored.
      const replay = one(await sql<{ approve_transfer: { success?: boolean } }[]>`
        SELECT approve_transfer(${tid}, ${sql.json([{ id: itemId, approved_qty: 99 }])}, ${k}) AS approve_transfer`,
        "approve replay").approve_transfer;
      check("approve: same-key replay returns original success payload",
        replay.success === true, `got ${JSON.stringify(replay)}`);
      check("approve: same-key replay did NOT overwrite approved_qty",
        (await approvedQty(itemId)) === 4, `qty=${await approvedQty(itemId)} (expected 4)`);
    }

    // ── 4. negative approved_qty rejected, transfer untouched ────────────
    {
      const { tid, itemId } = await mkTransfer();
      await expectThrow(
        () => sql`SELECT approve_transfer(${tid}, ${sql.json([{ id: itemId, approved_qty: -1 }])}, ${randomUUID()})`,
        "cannot be negative",
        "approve: negative approved_qty rejected",
      );
      check("approve: rejected negative left transfer 'requested'",
        (await status(tid)) === "requested", `status=${await status(tid)}`);
    }

    // ── 6 + 7. reject happy path + idempotent replay ─────────────────────
    {
      const { tid } = await mkTransfer();
      const k = randomUUID(); testKeys.push(k);
      await sql`SELECT reject_transfer(${tid}, 'out of stock', ${k})`;
      const row = one(await sql<{ status: string; rejection_reason: string | null }[]>`
        SELECT status, rejection_reason FROM transfer_requests WHERE id = ${tid}`, "reject row");
      check("reject: status → rejected + reason stored",
        row.status === "rejected" && row.rejection_reason === "out of stock",
        `status=${row.status} reason=${row.rejection_reason}`);
      // Replay same key with a different reason — must be ignored.
      await sql`SELECT reject_transfer(${tid}, 'different reason', ${k})`;
      const after = one(await sql<{ status: string; rejection_reason: string | null }[]>`
        SELECT status, rejection_reason FROM transfer_requests WHERE id = ${tid}`, "reject replay row");
      check("reject: same-key replay did not change status/reason",
        after.status === "rejected" && after.rejection_reason === "out of stock",
        `status=${after.status} reason=${after.rejection_reason}`);
    }

    // ── 8. NULL idempotency key still works (claim returns true on NULL) ──
    {
      const { tid, itemId } = await mkTransfer();
      await sql`SELECT approve_transfer(${tid}, ${sql.json([{ id: itemId, approved_qty: 2 }])}, NULL)`;
      check("approve: NULL idempotency key path works",
        (await status(tid)) === "approved" && (await approvedQty(itemId)) === 2,
        `status=${await status(tid)} qty=${await approvedQty(itemId)}`);
    }
  } finally {
    for (const tid of transferIds) await sql`DELETE FROM transfer_requests WHERE id = ${tid}`;
    if (testKeys.length) await sql`DELETE FROM rpc_idempotency WHERE idempotency_key = ANY(${testKeys})`;
    await sql`DELETE FROM fabrics WHERE id = ${fabId}`;
    await sql.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
