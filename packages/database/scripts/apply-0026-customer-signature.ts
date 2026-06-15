import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0026: orders.customer_signature_url. Idempotent
 * (ADD COLUMN IF NOT EXISTS, no data mutation) — safe to re-run.
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0026_order_customer_signature.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: orders.customer_signature_url added.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
