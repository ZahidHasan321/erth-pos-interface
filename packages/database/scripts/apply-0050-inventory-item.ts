import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0050: admin dashboard per-item inventory drilldown.
 * One CREATE OR REPLACE read-only RPC (admin_inventory_item). Idempotent,
 * safe to re-run.
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0050_admin_inventory_item.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: 0050 applied (admin_inventory_item RPC).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
