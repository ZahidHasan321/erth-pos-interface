import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

/**
 * Add the qc_rework_stages text[] column to garments. Stores the list of
 * production stages a garment must re-run when QC fails. Cleared on QC pass
 * or when a new schedule starts. Safe to re-run.
 */
async function main() {
  await db.execute(
    sql`ALTER TABLE garments ADD COLUMN IF NOT EXISTS qc_rework_stages text[]`,
  );
  console.log("OK: qc_rework_stages text[] column present on garments.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
