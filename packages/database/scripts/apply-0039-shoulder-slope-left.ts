import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0039: add LEFT SHOULDER values + explicit NONE to the
 * shoulder_slope enum (purely additive, IF NOT EXISTS, safe to re-run).
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0039_shoulder_slope_add_left.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));

  const labels = (await db.execute(sql`
    SELECT e.enumlabel AS label, e.enumsortorder AS ord
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'shoulder_slope'
    ORDER BY e.enumsortorder
  `)) as unknown as Array<{ label: string; ord: number }>;
  console.log("OK: 0039 applied. shoulder_slope values now:");
  console.log(labels.map((l) => `  ${l.ord}. ${l.label}`).join("\n"));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
