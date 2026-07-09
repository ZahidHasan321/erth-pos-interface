import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0055: enforce the SPEC §5 customer-account invariants in the
 * DB (account_type NOT NULL, Secondary <=> primary + relation, no self-link, no
 * chains deeper than one level). Idempotent, safe to re-run.
 *
 * Refuses to apply if any existing row violates a rule -- a constraint added
 * over dirty data would either fail or (worse) be added NOT VALID and lie.
 */
const PRECHECKS: Array<[string, ReturnType<typeof sql>]> = [
  ["account_type IS NULL", sql`SELECT id FROM customers WHERE account_type IS NULL`],
  ["Primary carrying a link/relation", sql`SELECT id FROM customers WHERE account_type = 'Primary' AND (primary_customer_id IS NOT NULL OR (relation IS NOT NULL AND relation <> ''))`],
  ["Secondary missing link/relation", sql`SELECT id FROM customers WHERE account_type = 'Secondary' AND (primary_customer_id IS NULL OR relation IS NULL OR relation = '')`],
  ["self-link", sql`SELECT id FROM customers WHERE primary_customer_id = id`],
  ["links to a non-Primary", sql`SELECT s.id FROM customers s JOIN customers p ON p.id = s.primary_customer_id WHERE p.account_type <> 'Primary'`],
];

async function main() {
  for (const [label, query] of PRECHECKS) {
    const rows = (await db.execute(query)) as unknown as Array<{ id: number }>;
    if (rows.length > 0) {
      console.error(`ABORT: ${rows.length} customer(s) violate "${label}": ${rows.map((r) => r.id).join(", ")}`);
      console.error("Clean these rows before applying 0055.");
      process.exit(1);
    }
    console.log(`  precheck ok: no ${label}`);
  }

  const file = path.join(__dirname, "../src/migrations/0055_customer_family_link_integrity.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));

  const constraints = (await db.execute(sql`
    SELECT conname FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
    WHERE c.relname = 'customers' AND con.contype = 'c' ORDER BY conname
  `)) as unknown as Array<{ conname: string }>;
  const trigger = (await db.execute(sql`
    SELECT tgname FROM pg_trigger WHERE tgname = 'customers_family_link_guard_trg' AND NOT tgisinternal
  `)) as unknown as Array<{ tgname: string }>;

  console.log("OK: 0055 applied.");
  console.log("  check constraints:", constraints.map((c) => c.conname).join(", ") || "(none)");
  console.log("  trigger:", trigger.length ? trigger[0].tgname : "(MISSING)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
