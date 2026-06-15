/**
 * Idempotency guard test for the corruption-risk RPCs.
 *
 * Proves the generic guard triad makes a guarded RPC replay-safe:
 *   - idem_claim()  — a second call with the SAME key does NOT re-apply
 *     side effects; a DIFFERENT (or NULL) key does; a rolled-back call
 *     releases its claim so a genuine retry still works.
 *   - idem_store()  — the ORIGINAL result is persisted under the claimed key.
 *   - idem_replay() — a deduped call returns that REAL stored payload
 *     (not a generic "idempotent_replay" stub). The stub is only the
 *     documented out-of-scope concurrency fallback (claimed-but-not-yet-stored).
 *
 * All 12 guarded RPCs route through this identical triad. We exercise it
 * directly at the helper level, plus end-to-end through restock_item and
 * consume_for_order (the two with cheap, self-contained fixtures). The other
 * 10 (complete_work_order, *_sales_order, *_transfer*, close_register,
 * add_cash_movement, …) share the exact same `IF NOT idem_claim … RETURN
 * idem_replay … idem_store(v_result)` shape — proving the triad + two
 * integration paths covers the mechanism without standing up registers,
 * work orders and transfer chains blind. Per-RPC integration fixtures for
 * those are deliberately deferred.
 *
 * Self-contained: applies migration 0016 + triggers.sql first, then runs
 * assertions against a throwaway fabric row, then cleans everything up.
 *
 * Usage: pnpm --filter @repo/database db:test-idempotency
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

dotenv.config();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} — ${detail}`);
  }
}

/** First row or a descriptive throw — kills the noUncheckedIndexedAccess
 *  "possibly undefined" without scattering non-null assertions. */
function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Expected a row from ${what}, got none`);
  return row;
}

async function shopStock(id: number): Promise<number> {
  const rows = await sql<{ shop_stock: string }[]>`
    SELECT shop_stock FROM fabrics WHERE id = ${id}`;
  return Number(one(rows, "shopStock query").shop_stock);
}

async function main() {
  console.log("Applying migration 0016 + triggers.sql…");
  await sql.unsafe(
    fs.readFileSync(path.join(__dirname, "../migrations/0016_rpc_idempotency.sql"), "utf-8"),
  );
  await sql.unsafe(
    fs.readFileSync(path.join(__dirname, "../src/triggers.sql"), "utf-8"),
  );

  // Throwaway fabric (name is unique+notNull; stock defaults to 0).
  const fabName = `__idem_test_${randomUUID()}`;
  const fabRows = await sql<{ id: number }[]>`
    INSERT INTO fabrics (name, shop_stock, workshop_stock)
    VALUES (${fabName}, 0, 0) RETURNING id`;
  const fabId = one(fabRows, "fabric insert").id;
  const testKeys: string[] = [];

  try {
    // ── restock_item ───────────────────────────────────────────────────
    // Positional args: (type, id, location, qty, supplier, unit_cost, notes,
    // image_url, user_id, idempotency_key). The key stays last.
    // A. Same key twice → applied once (the core corruption guard).
    const kA = randomUUID(); testKeys.push(kA);
    const firstRows = await sql<{ restock_item: { success?: boolean; new_stock?: number } }[]>`
      SELECT restock_item('fabric', ${fabId}, 'shop', 5, NULL, NULL, NULL, NULL, NULL, ${kA}) AS restock_item`;
    const firstResult = one(firstRows, "restock_item first call").restock_item;
    await sql`SELECT restock_item('fabric', ${fabId}, 'shop', 5, NULL, NULL, NULL, NULL, NULL, ${kA})`;
    const afterA = await shopStock(fabId);
    check("restock_item: same key twice applies once", afterA === 5, `expected 5, got ${afterA}`);

    // B. Replay returns the REAL stored payload — not a stub. This is the
    //    point of idem_store/idem_replay: a deduped retry must see exactly
    //    what the original call returned, so the client behaves identically.
    const replayRows = await sql<{
      restock_item: { success?: boolean; new_stock?: number; result_pending?: boolean; idempotent_replay?: boolean };
    }[]>`
      SELECT restock_item('fabric', ${fabId}, 'shop', 5, NULL, NULL, NULL, NULL, NULL, ${kA}) AS restock_item`;
    const replay = one(replayRows, "restock_item replay").restock_item;
    check(
      "restock_item: replay returns the REAL original payload (not a stub)",
      replay.success === true &&
        replay.new_stock === 5 &&
        replay.new_stock === firstResult.new_stock &&
        replay.result_pending === undefined,
      `expected {success:true,new_stock:5} matching first call, got ${JSON.stringify(replay)}`,
    );
    const afterB = await shopStock(fabId);
    check("restock_item: extra replay still no double-apply", afterB === 5, `expected 5, got ${afterB}`);

    // C. Two DIFFERENT keys → both apply (distinct logical operations).
    const kC1 = randomUUID(); const kC2 = randomUUID(); testKeys.push(kC1, kC2);
    await sql`SELECT restock_item('fabric', ${fabId}, 'shop', 3, NULL, NULL, NULL, NULL, NULL, ${kC1})`;
    await sql`SELECT restock_item('fabric', ${fabId}, 'shop', 3, NULL, NULL, NULL, NULL, NULL, ${kC2})`;
    const afterC = await shopStock(fabId);
    check("restock_item: distinct keys both apply", afterC === 11, `expected 11 (5+3+3), got ${afterC}`);

    // D. NULL key → no dedupe (documents: key is required for safety).
    await sql`SELECT restock_item('fabric', ${fabId}, 'shop', 2, NULL, NULL, NULL, NULL, NULL, NULL)`;
    await sql`SELECT restock_item('fabric', ${fabId}, 'shop', 2, NULL, NULL, NULL, NULL, NULL, NULL)`;
    const afterD = await shopStock(fabId);
    check("restock_item: NULL key is NOT deduped (both apply)", afterD === 15, `expected 15 (11+2+2), got ${afterD}`);

    // E. Rolled-back call releases the claim → genuine retry still works.
    //    sql.reserve() gives a dedicated connection so we can drive an
    //    explicit BEGIN/ROLLBACK (simulates an RPC failing after it claimed).
    const kE = randomUUID(); testKeys.push(kE);
    const tx = await sql.reserve();
    try {
      await tx`BEGIN`;
      await tx`SELECT restock_item('fabric', ${fabId}, 'shop', 7, NULL, NULL, NULL, NULL, NULL, ${kE})`;
      await tx`ROLLBACK`;
    } finally {
      tx.release();
    }
    const afterERollback = await shopStock(fabId);
    check("restock_item: rolled-back call did not apply", afterERollback === 15, `expected 15, got ${afterERollback}`);
    await sql`SELECT restock_item('fabric', ${fabId}, 'shop', 7, NULL, NULL, NULL, NULL, NULL, ${kE})`;
    const afterERetry = await shopStock(fabId);
    check("restock_item: same key retried after rollback DOES apply", afterERetry === 22,
      `expected 22 (15+7), got ${afterERetry}`);

    // ── consume_for_order ──────────────────────────────────────────────
    // Same key twice → stock decremented once; replay returns real payload.
    const kF = randomUUID(); testKeys.push(kF);
    const fabricItems = sql.json([{ fabric_id: fabId, qty: 4 }]);
    await sql`SELECT consume_for_order(999999, ${fabricItems}, '[]'::jsonb, NULL, ${kF})`;
    const consumeReplayRows = await sql<{
      consume_for_order: { success?: boolean; order_id?: number; result_pending?: boolean };
    }[]>`
      SELECT consume_for_order(999999, ${fabricItems}, '[]'::jsonb, NULL, ${kF}) AS consume_for_order`;
    const consumeReplay = one(consumeReplayRows, "consume_for_order replay").consume_for_order;
    const afterF = await shopStock(fabId);
    check("consume_for_order: same key twice decrements once", afterF === 18,
      `expected 18 (22-4), got ${afterF}`);
    check(
      "consume_for_order: replay returns the REAL original payload (not a stub)",
      consumeReplay.success === true &&
        consumeReplay.order_id === 999999 &&
        consumeReplay.result_pending === undefined,
      `expected {success:true,order_id:999999}, got ${JSON.stringify(consumeReplay)}`,
    );

    // ── helper triad: idem_claim / idem_store / idem_replay ────────────
    // All 12 guarded RPCs delegate to these three. Test them directly.
    const kG = randomUUID(); testKeys.push(kG);
    const g1 = one(await sql<{ idem_claim: boolean }[]>`SELECT idem_claim(${kG}, 'unit_test') AS idem_claim`, "idem_claim g1");
    const g2 = one(await sql<{ idem_claim: boolean }[]>`SELECT idem_claim(${kG}, 'unit_test') AS idem_claim`, "idem_claim g2");
    check("idem_claim: first call true, second false", g1.idem_claim === true && g2.idem_claim === false,
      `got ${g1.idem_claim}/${g2.idem_claim}`);
    const gNull = one(await sql<{ idem_claim: boolean }[]>`SELECT idem_claim(NULL, 'unit_test') AS idem_claim`, "idem_claim NULL");
    check("idem_claim: NULL key always proceeds (true)", gNull.idem_claim === true, `got ${gNull.idem_claim}`);

    // idem_replay BEFORE store → claimed-but-unstored → documented
    // out-of-scope concurrency fallback stub.
    const pendingRow = one(
      await sql<{ idem_replay: { idempotent_replay?: boolean; result_pending?: boolean } }[]>`
        SELECT idem_replay(${kG}) AS idem_replay`,
      "idem_replay pending",
    );
    check(
      "idem_replay: claimed-but-unstored returns the result_pending stub",
      pendingRow.idem_replay?.result_pending === true && pendingRow.idem_replay?.idempotent_replay === true,
      `got ${JSON.stringify(pendingRow.idem_replay)}`,
    );

    // idem_store the real payload → idem_replay returns it VERBATIM.
    const realPayload = { success: true, foo: "bar", n: 42 };
    await sql`SELECT idem_store(${kG}, ${sql.json(realPayload)})`;
    const storedRow = one(
      await sql<{ idem_replay: typeof realPayload }[]>`SELECT idem_replay(${kG}) AS idem_replay`,
      "idem_replay stored",
    );
    // jsonb does not preserve key order, so compare by key/value, not by
    // serialized string.
    const sortedJson = (o: object) =>
      JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))));
    check(
      "idem_replay: after idem_store returns the stored payload verbatim",
      sortedJson(storedRow.idem_replay) === sortedJson(realPayload),
      `expected ${JSON.stringify(realPayload)}, got ${JSON.stringify(storedRow.idem_replay)}`,
    );
  } finally {
    // Cleanup: ledger rows, stock movements, the throwaway fabric.
    if (testKeys.length) {
      await sql`DELETE FROM rpc_idempotency WHERE idempotency_key = ANY(${sql.array(testKeys)}::uuid[])`;
      await sql`DELETE FROM rpc_idempotency WHERE rpc_name = 'unit_test'`;
    }
    await sql`DELETE FROM stock_movements WHERE item_type = 'fabric' AND item_id = ${fabId}`.catch(() => {});
    await sql`DELETE FROM fabrics WHERE id = ${fabId}`;
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
