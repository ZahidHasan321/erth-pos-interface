/**
 * One-shot migration: drop deprecated measurement columns per PDF spec
 * (MEASURES NAMING.pdf, 2026-05).
 *
 *  - `armhole`              → ARMHOLE FULL marked "TO REMOVE" in PDF
 *  - `armhole_provision`    → computed from armhole, no longer meaningful
 *  - `basma_sleeve_length`  → consolidated to just basma_length + basma_width
 *
 * Live DB inspected before drop (45 rows on 2026-05-12): all values were
 * test/seed data (0.00 / 1.00 / 21.00), no real measurements. Safe.
 *
 * Run once: pnpm --filter @repo/database tsx scripts/drop-deprecated-measurement-cols.ts
 */
import postgres from "postgres";
import "dotenv/config";

const COLUMNS_TO_DROP = ["armhole", "armhole_provision", "basma_sleeve_length"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const sql = postgres(url, { prepare: false });
  try {
    for (const col of COLUMNS_TO_DROP) {
      console.log(`Dropping measurements.${col}…`);
      await sql.unsafe(`ALTER TABLE measurements DROP COLUMN IF EXISTS ${col};`);
    }
    console.log("Done.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
