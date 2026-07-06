import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0054: add customer_id to get_cashier_pending_orders so the
 * cashier Pending family-link nudge (SPEC §3) can group co-pending orders by
 * customer family. CREATE OR REPLACE, idempotent, safe to re-run. Prints a
 * sample row to confirm customer_id is present.
 */
async function main() {
  const file = path.join(
    __dirname,
    "../src/migrations/0054_cashier_pending_customer_id.sql",
  );
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));

  const sample = (await db.execute(sql`
    SELECT get_cashier_pending_orders('erth', 1) AS rows
  `)) as unknown as Array<{ rows: unknown }>;

  console.log("OK: 0054 applied (get_cashier_pending_orders now returns customer_id).");
  console.log("  sample:", JSON.stringify(sample[0]?.rows));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
