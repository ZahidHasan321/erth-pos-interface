import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0033: explicit customers.primary_customer_id link + best-effort
 * backfill (SPEC §5 "Customer accounts"). All statements are idempotent
 * (IF NOT EXISTS / NULL-only backfill), safe to re-run. After this, apply
 * triggers (db:triggers) so the find_accounts_by_phone lookup RPC is available.
 * Prints a backfill report: how many Secondaries were linked vs left for a
 * manual pass.
 */
async function main() {
  const file = path.join(__dirname, "../src/migrations/0033_customer_primary_link.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));

  const report = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE account_type = 'Secondary')::int                                AS secondary_total,
      COUNT(*) FILTER (WHERE account_type = 'Secondary' AND primary_customer_id IS NOT NULL)::int AS linked,
      COUNT(*) FILTER (WHERE account_type = 'Secondary' AND primary_customer_id IS NULL)::int      AS unlinked
    FROM customers
  `)) as unknown as Array<{ secondary_total: number; linked: number; unlinked: number }>;
  const r = report[0] ?? { secondary_total: 0, linked: 0, unlinked: 0 };
  console.log("OK: 0033 applied (customers.primary_customer_id).");
  console.log(
    `Backfill report - Secondary accounts: total=${r.secondary_total}, linked=${r.linked}, unlinked=${r.unlinked} (unlinked need a manual primary pick).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
