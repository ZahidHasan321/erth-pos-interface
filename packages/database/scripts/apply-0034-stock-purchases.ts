import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0034: stock-purchase payables + weighted-average cost
 * (SPEC §3 cashier "Stock-purchase settlement", §4 inventory "Cost basis").
 * All statements are idempotent (IF NOT EXISTS / DO-guarded CREATE TYPE), safe
 * to re-run. After this, apply triggers (db:triggers) so restock_item's
 * WAC+payable logic, the sync trigger, pay_stock_purchase, get_stock_purchases,
 * and the RLS policies are live.
 */
async function main() {
  const file = path.join(__dirname, "../src/migrations/0034_stock_purchases.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));

  const report = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM stock_purchases)::int          AS purchases,
      (SELECT COUNT(*) FROM stock_purchase_payments)::int  AS payments,
      (SELECT COUNT(*) FROM fabrics WHERE avg_cost IS NOT NULL)::int AS fabrics_with_wac,
      (SELECT COUNT(*) FROM shelf   WHERE avg_cost IS NOT NULL)::int AS shelf_with_wac
  `)) as unknown as Array<{ purchases: number; payments: number; fabrics_with_wac: number; shelf_with_wac: number }>;
  const r = report[0] ?? { purchases: 0, payments: 0, fabrics_with_wac: 0, shelf_with_wac: 0 };
  console.log("OK: 0034 applied (stock_purchases + stock_purchase_payments + avg_cost).");
  console.log(
    `State - purchases=${r.purchases}, payments=${r.payments}, fabrics_with_wac=${r.fabrics_with_wac}, shelf_with_wac=${r.shelf_with_wac}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
