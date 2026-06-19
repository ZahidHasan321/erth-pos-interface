import postgres from "postgres";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0030: block fabric/shelf from crossing to the workshop.
 * Adds RAISE EXCEPTION guards to restock_item / adjust_stock / record_waste
 * (reject non-shop location) and create_transfer_requests_batch /
 * direct_send_transfers_batch (reject non-accessory item_type). Idempotent
 * (CREATE OR REPLACE, no data mutation) — safe to re-run.
 */
dotenv.config();

// prepare:false → simple-query mode, required for multi-statement SQL with
// dollar-quoted ($$) function bodies.
const client = postgres(process.env.DATABASE_URL!, { prepare: false });

const GUARDED = [
  "restock_item",
  "adjust_stock",
  "record_waste",
  "create_transfer_requests_batch",
  "direct_send_transfers_batch",
];

async function main() {
  const file = path.join(__dirname, "../migrations/0030_block_fabric_shelf_workshop.sql");
  const sqlText = fs.readFileSync(file, "utf-8");

  console.log("Applying 0030_block_fabric_shelf_workshop ...");
  await client.unsafe(sqlText);
  console.log("Applied. Verifying guards are present in the live functions ...");

  let allOk = true;
  for (const fn of GUARDED) {
    const rows = await client`
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = ${fn} AND n.nspname = 'public'
    `;
    const hasGuard = rows.some((r) => String(r.def).includes("SPEC §4"));
    console.log(`  ${hasGuard ? "OK " : "MISSING"}  ${fn}${rows.length ? "" : " (function not found!)"}`);
    if (!hasGuard) allOk = false;
  }

  if (!allOk) {
    console.error("ERROR: one or more guards are not present after apply.");
    process.exit(1);
  }
  console.log("All guards verified live.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
