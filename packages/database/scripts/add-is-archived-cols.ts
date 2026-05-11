import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

/**
 * Add is_archived boolean to fabrics, shelf, accessories. Items used in any
 * order or referenced by FK can't be hard-deleted, so the app falls back to
 * archiving them. Safe to re-run.
 */
async function main() {
  await db.execute(
    sql`ALTER TABLE fabrics     ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`,
  );
  await db.execute(
    sql`ALTER TABLE shelf       ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`,
  );
  await db.execute(
    sql`ALTER TABLE accessories ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`,
  );
  console.log("OK: is_archived column present on fabrics, shelf, accessories.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
