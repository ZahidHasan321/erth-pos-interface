import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

// Server-side, in-DB backup of every table the customer-misattribution fix could
// touch. CTAS is instant and fully reversible (UPDATE ... FROM backup.<t>).
const TABLES = ["orders", "work_orders", "alteration_orders", "measurements", "customers", "garments"];
const SCHEMA = "backup_custfix_20260629";

async function main() {
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`));
  for (const t of TABLES) {
    // drop+recreate so re-running gives a clean snapshot
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${SCHEMA}.${t}`));
    await db.execute(sql.raw(`CREATE TABLE ${SCHEMA}.${t} AS TABLE public.${t}`));
    const [{ n }] = (await db.execute(sql.raw(`SELECT count(*)::int n FROM ${SCHEMA}.${t}`))) as any[];
    console.log(`backed up ${SCHEMA}.${t}: ${n} rows`);
  }
  console.log(`\nDone. Restore example:\n  UPDATE public.orders o SET customer_id = b.customer_id FROM ${SCHEMA}.orders b WHERE b.id = o.id;`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
