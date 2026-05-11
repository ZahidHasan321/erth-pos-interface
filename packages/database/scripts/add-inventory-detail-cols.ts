import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

/**
 * Add image_url, description, low_stock_threshold to fabrics, shelf, accessories.
 * Supports the dedicated inventory detail page (per-item image, notes, custom
 * low-stock override). Safe to re-run.
 */
async function main() {
  // fabrics — numeric threshold (meters can be fractional)
  await db.execute(sql`ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS image_url text`);
  await db.execute(sql`ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS description text`);
  await db.execute(
    sql`ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(10,2)`,
  );

  // shelf — integer threshold (whole pieces only)
  await db.execute(sql`ALTER TABLE shelf ADD COLUMN IF NOT EXISTS image_url text`);
  await db.execute(sql`ALTER TABLE shelf ADD COLUMN IF NOT EXISTS description text`);
  await db.execute(
    sql`ALTER TABLE shelf ADD COLUMN IF NOT EXISTS low_stock_threshold integer`,
  );

  // accessories — numeric threshold (unit varies: pcs/m/rolls/kg)
  await db.execute(sql`ALTER TABLE accessories ADD COLUMN IF NOT EXISTS image_url text`);
  await db.execute(sql`ALTER TABLE accessories ADD COLUMN IF NOT EXISTS description text`);
  await db.execute(
    sql`ALTER TABLE accessories ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(10,2)`,
  );

  console.log("OK: image_url, description, low_stock_threshold present on fabrics, shelf, accessories.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
