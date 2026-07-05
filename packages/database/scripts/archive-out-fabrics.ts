import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

/**
 * Hide the leftover customer-brought ("OUT") fabric placeholders from inventory.
 *
 * The fabrics catalog is meant to be our own fabric only. Two rows imported from
 * the old Airtable base -- OUTSIDE (id 25) and OUT (id 63) -- are catch-alls for
 * customer-brought fabric and were showing up in inventory. They cannot be
 * deleted (3,969 historical garments reference them via a NO ACTION FK), so we
 * back them up and archive them (is_archived=true); inventory / stocktake /
 * low-stock all filter is_archived=false, so they drop out of view while every
 * garment reference stays intact. Idempotent -- safe to re-run.
 */
async function main() {
  // 1. Back up the full rows (keep a copy in case the client wants them back).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fabrics_out_placeholder_backup
      (LIKE fabrics INCLUDING ALL);
  `);
  await db.execute(sql`
    INSERT INTO fabrics_out_placeholder_backup
    SELECT * FROM fabrics
    WHERE name IN ('OUT', 'OUTSIDE')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 2. Archive them out of the inventory view.
  const res = await db.execute(sql`
    UPDATE fabrics
    SET is_archived = true
    WHERE name IN ('OUT', 'OUTSIDE') AND is_archived = false
    RETURNING id, name;
  `);

  const backup = await db.execute(sql`SELECT id, name FROM fabrics_out_placeholder_backup ORDER BY id;`);
  console.log("Backed up rows:", (backup.rows ?? backup));
  console.log("Newly archived this run:", (res.rows ?? res));
  console.log("OK: OUT/OUTSIDE placeholders backed up and archived.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
