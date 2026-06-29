/**
 * Backfill measurements.measurement_date for legacy-imported rows.
 *
 * The Airtable MEASURE.csv had no creation date, so the import left
 * measurement_date NULL on ~1,900 rows. A measurement was created at/around
 * the time of the first order that used it, so we derive the date from the
 * EARLIEST order that references the measurement (via garments.measurement_id).
 *
 * Safety:
 *  - Only touches rows where measurement_date IS NULL (idempotent; re-runnable).
 *  - Only sets a date when the measurement is used by >=1 order; unused
 *    null-dated rows (no order to derive from) are left NULL and reported.
 *  - Backup of measurements already exists (backup_custfix_20260629.measurements,
 *    captured pre-fix while all dates were NULL) so this is fully reversible:
 *      UPDATE public.measurements m SET measurement_date = b.measurement_date
 *      FROM backup_custfix_20260629.measurements b WHERE b.id = m.id;
 *  - DRY RUN unless --apply is passed.
 */
import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

async function main() {
  // Earliest linked order_date per null-dated measurement.
  const derivable = (await db.execute(sql`
    SELECT m.id, MIN(o.order_date) AS order_date
    FROM measurements m
    JOIN garments g ON g.measurement_id = m.id
    JOIN orders o ON o.id = g.order_id
    WHERE m.measurement_date IS NULL
    GROUP BY m.id
  `)) as { id: string; order_date: string }[];

  const [{ unused }] = (await db.execute(sql`
    SELECT count(*)::int AS unused
    FROM measurements m
    WHERE m.measurement_date IS NULL
      AND NOT EXISTS (SELECT 1 FROM garments g WHERE g.measurement_id = m.id)
  `)) as { unused: number }[];

  console.log(`null-dated measurements derivable from an order: ${derivable.length}`);
  console.log(`null-dated measurements with NO order (left NULL): ${unused}`);
  console.log(`\nsample (first 10):`);
  console.table(
    derivable.slice(0, 10).map((r) => ({ id: r.id, derived_date: String(r.order_date).slice(0, 10) })),
  );

  if (!APPLY) {
    console.log(`\nDRY RUN. Re-run with --apply to set ${derivable.length} dates.`);
    process.exit(0);
  }

  console.log(`\nAPPLYING ${derivable.length} date backfills...`);
  // Single set-based UPDATE: derive earliest order_date inline, only NULL rows.
  const res = await db.execute(sql`
    UPDATE measurements m
    SET measurement_date = sub.order_date
    FROM (
      SELECT g.measurement_id AS mid, MIN(o.order_date) AS order_date
      FROM garments g JOIN orders o ON o.id = g.order_id
      WHERE g.measurement_id IS NOT NULL
      GROUP BY g.measurement_id
    ) sub
    WHERE m.id = sub.mid AND m.measurement_date IS NULL
  `);
  console.log(`rows updated: ${(res as { count?: number }).count ?? "?"}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
