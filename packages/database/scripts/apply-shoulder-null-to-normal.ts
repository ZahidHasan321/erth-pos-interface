import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * One-off: set NULL shoulder_slope -> 'normal' for measurements taken on/after
 * 2026-06-09 (when the shoulder-slope field first shipped). NORMAL is the stored
 * value `normal`. Historical/imported measurements (pre 2026-06-09) are left NULL.
 * Idempotent: only touches rows still NULL.
 */
const CUTOFF = "2026-06-09";

async function main() {
  const affected = (await db.execute(sql`
    SELECT id, customer_id, to_char(measurement_date, 'YYYY-MM-DD') AS d
    FROM measurements
    WHERE shoulder_slope IS NULL AND measurement_date >= ${CUTOFF}
    ORDER BY measurement_date
  `)) as unknown as Array<Record<string, unknown>>;

  const backupPath = path.join(__dirname, "shoulder-null-backup.json");
  fs.writeFileSync(backupPath, JSON.stringify({ cutoff: CUTOFF, ids: affected }, null, 2));
  console.log(`Rows to update: ${affected.length} (backed up ids -> ${backupPath})`);

  const res = (await db.execute(sql`
    UPDATE measurements
    SET shoulder_slope = 'normal'
    WHERE shoulder_slope IS NULL AND measurement_date >= ${CUTOFF}
  `)) as unknown as { rowCount?: number };
  console.log(`UPDATE affected rows: ${res.rowCount ?? "(n/a)"}`);

  const remaining = (await db.execute(sql`
    SELECT count(*) AS n FROM measurements
    WHERE shoulder_slope IS NULL AND measurement_date >= ${CUTOFF}
  `)) as unknown as Array<{ n: number }>;
  console.log(`Remaining NULL on/after ${CUTOFF}: ${remaining[0].n}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
