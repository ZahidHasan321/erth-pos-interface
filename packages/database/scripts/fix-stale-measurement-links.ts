/**
 * Problem C fix: repoint post-migration garments that are linked to an OLD
 * measurement onto the NEW, complete measurement staff entered for the order.
 *
 * Source of truth: scripts/stale-measurement-links.json (produced by
 * detect-stale-measurement-links.ts, then human-reviewed via compare-stale-links.ts,
 * which confirmed CUR-ONLY=0 for every pair — i.e. repointing drops no data).
 *
 * Safety:
 *  - Updates only the exact (order_id, garment_id) rows in the report, and only
 *    while they still point at the old measurement (cur_meas_id) — idempotent,
 *    re-runnable, and a no-op for any row already corrected by hand.
 *  - Touches nothing else; the old measurement records are left intact (they may
 *    serve other/earlier orders).
 *  - Backup exists: backup_custfix_20260629.garments. Reverse with:
 *      UPDATE public.garments g SET measurement_id = b.measurement_id
 *      FROM backup_custfix_20260629.garments b
 *      WHERE b.order_id = g.order_id AND b.garment_id = g.garment_id;
 *  - DRY RUN unless --apply is passed.
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

async function main() {
  const flags = JSON.parse(
    fs.readFileSync(path.join(__dirname, "stale-measurement-links.json"), "utf8"),
  ) as any[];

  console.log(`garments to repoint: ${flags.length} (apply=${APPLY})`);
  console.table(
    flags.map((f) => ({
      order: f.order_id, garment: f.garment_id, customer: f.customer,
      from: f.cur_code, to: f.expected_code,
    })),
  );

  if (!APPLY) {
    console.log(`\nDRY RUN. Re-run with --apply to repoint ${flags.length} garments.`);
    process.exit(0);
  }

  let done = 0;
  for (const f of flags) {
    const res = await db.execute(sql`
      UPDATE garments
      SET measurement_id = ${f.expected_meas_id}
      WHERE order_id = ${f.order_id}
        AND garment_id = ${f.garment_id}
        AND measurement_id = ${f.cur_meas_id}
    `);
    const n = (res as { count?: number }).count ?? 0;
    done += n;
    if (n === 0) console.log(`  no-op (already changed?): order ${f.order_id} garment ${f.garment_id}`);
  }
  console.log(`\nrepointed ${done} garments.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
