/**
 * Fix wrongly-entered shoulder_slope on the QC "mistakes to fix" list.
 *
 * Per the client's QC-fail screenshots, these garments' Shoulder Slope "Should
 * be" is empty but the DB holds `both_straight`. Per stakeholder direction, "no
 * notable slope" is stored as the explicit `normal` value (shoulder_slope is
 * only NULL when specifically intended), so this resets them to `normal`.
 *
 * Guarded + idempotent: only rows CURRENTLY `both_straight` are touched, scoped
 * to the given order's measurement rows. shoulder_slope lives on the (shared)
 * measurement row, so all garments sharing a nulled row are updated together
 * (approved: 2510-1 / 2520-1 ride along with their order-mates).
 *
 *   pnpm --filter @repo/database exec tsx scripts/fix-shoulder-slope-mistakes.ts <orderId>
 */
import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const orderId = Number(process.argv[2]);
  if (!Number.isInteger(orderId)) {
    console.error("Usage: fix-shoulder-slope-mistakes.ts <orderId>");
    process.exit(1);
  }

  const before = await db.execute(sql`
    SELECT g.garment_id, g.measurement_id, m.shoulder_slope
    FROM garments g LEFT JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = ${orderId}
    ORDER BY g.garment_id
  `);
  console.log(`=== BEFORE (order ${orderId}) ===`);
  console.log(JSON.stringify(before, null, 2));

  const res = await db.execute(sql`
    UPDATE measurements SET shoulder_slope = 'normal'
    WHERE shoulder_slope = 'both_straight'
      AND id IN (
        SELECT DISTINCT measurement_id FROM garments
        WHERE order_id = ${orderId} AND measurement_id IS NOT NULL
      )
  `);
  console.log(`\nmeasurement rows updated: ${(res as { count?: number }).count ?? (res as { rowCount?: number }).rowCount}`);

  const after = await db.execute(sql`
    SELECT g.garment_id, g.measurement_id, m.shoulder_slope
    FROM garments g LEFT JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = ${orderId}
    ORDER BY g.garment_id
  `);
  console.log(`\n=== AFTER (order ${orderId}) ===`);
  console.log(JSON.stringify(after, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
