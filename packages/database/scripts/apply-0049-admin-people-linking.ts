import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0049: admin dashboard family grouping + order-link visibility.
 * Three CREATE OR REPLACE read-only RPCs (admin_orders_page,
 * admin_customers_page, admin_customer_detail). Idempotent, safe to re-run.
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0049_admin_people_linking.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: 0049 applied (admin people linking RPCs).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
