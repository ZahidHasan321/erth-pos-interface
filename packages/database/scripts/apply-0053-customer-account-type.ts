import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0053: normalize legacy customers.account_type (Airtable import
 * left blanks), default future rows to Primary, and make find_accounts_by_phone
 * NULL-tolerant so a legacy/blank account can be picked as a family head (SPEC
 * §5). All statements are idempotent, safe to re-run. Prints a before/after
 * account_type distribution.
 */
async function main() {
  const before = (await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE account_type IS NULL)::int         AS null_type,
           COUNT(*) FILTER (WHERE account_type = 'Primary')::int     AS primary_type,
           COUNT(*) FILTER (WHERE account_type = 'Secondary')::int   AS secondary_type
    FROM customers
  `)) as unknown as Array<{ null_type: number; primary_type: number; secondary_type: number }>;

  const file = path.join(__dirname, "../src/migrations/0053_customer_account_type_backfill.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));

  const after = (await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE account_type IS NULL)::int         AS null_type,
           COUNT(*) FILTER (WHERE account_type = 'Primary')::int     AS primary_type,
           COUNT(*) FILTER (WHERE account_type = 'Secondary')::int   AS secondary_type
    FROM customers
  `)) as unknown as Array<{ null_type: number; primary_type: number; secondary_type: number }>;

  console.log("OK: 0053 applied (account_type backfill + default + NULL-tolerant lookup).");
  console.log("  before:", JSON.stringify(before[0]));
  console.log("  after: ", JSON.stringify(after[0]));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
