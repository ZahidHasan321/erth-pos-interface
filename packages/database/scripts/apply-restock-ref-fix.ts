import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0019: restock_item ref_type/ref_id stamping fix. Idempotent
 * (CREATE OR REPLACE, no data mutation) — safe to re-run. Only affects newly
 * written ledger rows; existing rows are unchanged.
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0019_restock_ref_fix.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: restock_item ref stamping fixed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
