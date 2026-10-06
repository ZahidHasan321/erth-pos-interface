import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply 0059: garments.brand. Runs the `garment-brand` block of
 * src/triggers.sql (single source of truth): adds the column, the two sync
 * triggers, backfills it from each garment's order, and rewrites the
 * garments / garment_feedback SELECT policies to check the garment's own brand
 * instead of looking up its order per row. Access rules are unchanged.
 *
 * The backfill rewrites every garment row once (WAL + one Realtime event per
 * row), so run it when the shop is quiet. Idempotent: a re-run is a no-op.
 */
async function main() {
  const src = fs.readFileSync(path.join(__dirname, "../src/triggers.sql"), "utf-8");
  const start = src.indexOf("-- BEGIN garment-brand");
  const end = src.indexOf("-- END garment-brand");
  if (start === -1 || end === -1) {
    console.error("ABORT: garment-brand block markers not found in src/triggers.sql");
    process.exit(1);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(src.slice(start, end)));
  });

  const [check = { garments: 0, out_of_sync: 0 }] = (await db.execute(sql`
    SELECT count(*)::int AS garments,
           count(*) FILTER (WHERE g.brand IS DISTINCT FROM o.brand)::int AS out_of_sync
    FROM garments g JOIN orders o ON o.id = g.order_id
  `)) as unknown as Array<{ garments: number; out_of_sync: number }>;
  if (check.out_of_sync !== 0) {
    console.error(`ABORT: ${check.out_of_sync} of ${check.garments} garments have a brand different from their order`);
    process.exit(1);
  }

  console.log(`OK: 0059 applied. ${check.garments} garments, all in sync with their order's brand.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
