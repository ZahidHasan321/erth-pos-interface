import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

/**
 * Add the stage_timings jsonb column to garments. Safe to re-run —
 * uses IF NOT EXISTS. Bypasses drizzle-kit push, which currently fails
 * because assigned_order_agg is a VIEW declared in triggers.sql rather
 * than in schema.ts.
 */
async function main() {
  await db.execute(
    sql`ALTER TABLE garments ADD COLUMN IF NOT EXISTS stage_timings jsonb`,
  );
  console.log("OK: stage_timings jsonb column present on garments.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
