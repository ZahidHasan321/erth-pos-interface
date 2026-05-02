import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

/**
 * Add soaking_completed_at timestamptz column to garments. Tracks when a
 * fabric finished soaking. Soaking is now a parallel track (not a piece_stage),
 * gated by `soaking=true AND soaking_completed_at IS NULL`. Safe to re-run.
 */
async function main() {
  await db.execute(
    sql`ALTER TABLE garments ADD COLUMN IF NOT EXISTS soaking_completed_at timestamptz`,
  );
  console.log("OK: soaking_completed_at timestamptz column present on garments.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
