import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0032: add stock_movements.brand (SPEC §1/§4). ADD COLUMN IF
 * NOT EXISTS — idempotent, no data mutation, safe to re-run. After this, apply
 * triggers (db:triggers) so _log_stock_movement stamps the consuming brand and
 * get_consumption_by_brand can compile.
 */
async function main() {
  const file = path.join(__dirname, "../src/migrations/0032_stock_movement_brand.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: 0032 applied (stock_movements.brand).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
