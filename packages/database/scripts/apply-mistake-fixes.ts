/**
 * Apply the "mistakes to fix" QC corrections, one order at a time.
 *
 * Rule (per stakeholder): the screenshot "Found" column is the CORRECT value;
 * the DB currently holds the wrong "Should be" value. So we write Found.
 * Shoulder slope: the flagged garments become `normal` (no notable slope).
 *
 * Guarded + idempotent: each row is only changed when it still holds the exact
 * expected OLD value, so a re-run (or an already-correct row) is a no-op, and a
 * row that unexpectedly differs is reported (0 updated) rather than clobbered.
 *
 * Measurement fields live on the (sometimes shared) measurements row and are
 * updated via the garment's measurement_id. Booleans/lines live on garments.
 *
 *   pnpm --filter @repo/database exec tsx scripts/apply-mistake-fixes.ts <orderId>
 */
import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

type MeasChange = { kind: "meas"; garment: string; col: string; old: string; new: string };
type GarmChange = { kind: "garment"; garment: string; col: string; old: string | number | boolean; new: string | number | boolean };
type Change = MeasChange | GarmChange;

// Only the CLEAR rows. Gaps intentionally excluded:
//   2514-1/2 hidden options, 2519-1 collar_type (icon unreadable).
const CHANGES: Record<number, Change[]> = {
  2505: [
    { kind: "meas", garment: "2505-1", col: "top_pocket_width", old: "5.00", new: "4.75" },
  ],
  2506: [
    { kind: "meas", garment: "2506-1", col: "side_pocket_length", old: "15.50", new: "15.75" },
    { kind: "meas", garment: "2506-1", col: "side_pocket_opening", old: "7.25", new: "7.50" },
  ],
  2511: [
    { kind: "meas", garment: "2511-1", col: "chest_full", old: "35.00", new: "38.00" },
    { kind: "meas", garment: "2511-1", col: "shoulder", old: "16.25", new: "17.25" },
    { kind: "meas", garment: "2511-1", col: "sleeve_length", old: "24.00", new: "25.13" },
    { kind: "meas", garment: "2511-1", col: "sleeve_width", old: "5.50", new: "5.75" },
    { kind: "meas", garment: "2511-1", col: "elbow", old: "6.50", new: "6.88" },
    { kind: "meas", garment: "2511-1", col: "armhole_front", old: "9.50", new: "10.13" },
    { kind: "meas", garment: "2511-1", col: "chest_upper", old: "14.25", new: "15.50" },
    { kind: "meas", garment: "2511-1", col: "chest_front", old: "20.00", new: "21.50" },
    { kind: "meas", garment: "2511-1", col: "waist_front", old: "20.75", new: "21.50" },
    { kind: "meas", garment: "2511-1", col: "top_pocket_distance", old: "7.00", new: "7.25" },
    { kind: "meas", garment: "2511-1", col: "jabzour_length", old: "16.50", new: "17.25" },
    { kind: "meas", garment: "2511-1", col: "length_front", old: "56.25", new: "59.13" },
    { kind: "meas", garment: "2511-1", col: "bottom", old: "28.50", new: "29.63" },
    { kind: "meas", garment: "2511-1", col: "chest_back", old: "23.00", new: "23.75" },
    { kind: "meas", garment: "2511-1", col: "waist_back", old: "22.75", new: "24.00" },
    { kind: "meas", garment: "2511-1", col: "length_back", old: "57.50", new: "60.00" },
    { kind: "meas", garment: "2511-1", col: "collar_width", old: "14.63", new: "15.13" },
    { kind: "meas", garment: "2511-1", col: "top_pocket_length", old: "5.00", new: "5.25" },
    { kind: "meas", garment: "2511-1", col: "top_pocket_width", old: "4.50", new: "4.75" },
    { kind: "meas", garment: "2511-1", col: "side_pocket_length", old: "15.00", new: "15.25" },
    { kind: "meas", garment: "2511-1", col: "side_pocket_width", old: "8.00", new: "8.50" },
    { kind: "meas", garment: "2511-1", col: "side_pocket_distance", old: "6.00", new: "6.25" },
  ],
  2514: [
    { kind: "meas", garment: "2514-1", col: "side_pocket_length", old: "15.00", new: "15.25" },
    { kind: "meas", garment: "2514-2", col: "side_pocket_length", old: "15.00", new: "15.25" },
    // NOTE: wallet/mobile pocket + 2514-1's other 2 / 2514-2's other 1 option are GAPS (cropped) — not applied here.
  ],
  2515: [
    { kind: "meas", garment: "2515-1", col: "length_front", old: "59.38", new: "59.25" },
    { kind: "meas", garment: "2515-1", col: "side_pocket_distance", old: "6.50", new: "10.00" },
    { kind: "meas", garment: "2515-2", col: "length_front", old: "59.38", new: "59.25" },
  ],
  2510: [
    // second_button_distance is on the shared 2510 measurement row -> also 2510-1 (approved).
    { kind: "meas", garment: "2510-2", col: "second_button_distance", old: "0.00", new: "0.50" },
  ],
  2518: [
    { kind: "meas", garment: "2518-1", col: "jabzour_width", old: "1.50", new: "1.25" },
  ],
  2519: [
    { kind: "meas", garment: "2519-2", col: "sleeve_length", old: "25.00", new: "9.50" },
    { kind: "meas", garment: "2519-2", col: "sleeve_width", old: "6.00", new: "7.75" },
    // NOTE: 2519-1 collar_type is a GAP (icon) — not applied here.
  ],
  2520: [
    { kind: "garment", garment: "2520-2", col: "small_tabaggi", old: true, new: false },
    { kind: "garment", garment: "2520-3", col: "small_tabaggi", old: true, new: false },
    { kind: "garment", garment: "2520-4", col: "small_tabaggi", old: true, new: false },
  ],
  2525: [
    { kind: "meas", garment: "2525-1", col: "sleeve_width", old: "0.00", new: "10.25" },
    { kind: "meas", garment: "2525-1", col: "side_pocket_opening", old: "7.25", new: "7.50" },
  ],
};

// Orders whose flagged garments' shoulder_slope -> 'normal' (2510 already done).
const SLOPE_ORDERS = new Set([2517, 2518, 2519, 2520, 2521, 2524, 2525]);

async function applyChange(c: Change): Promise<number> {
  if (c.kind === "meas") {
    const r = await db.execute(sql`
      UPDATE measurements SET ${sql.raw(c.col)} = ${c.new}
      WHERE id = (SELECT measurement_id FROM garments WHERE garment_id = ${c.garment})
        AND ${sql.raw(c.col)} = ${c.old}
    `);
    return (r as { count?: number }).count ?? 0;
  } else {
    const r = await db.execute(sql`
      UPDATE garments SET ${sql.raw(c.col)} = ${c.new as never}
      WHERE garment_id = ${c.garment} AND ${sql.raw(c.col)} = ${c.old as never}
    `);
    return (r as { count?: number }).count ?? 0;
  }
}

async function snapshot(orderId: number) {
  return db.execute(sql`
    SELECT g.garment_id,
      m.shoulder_slope,
      m.top_pocket_width, m.top_pocket_length, m.top_pocket_distance,
      m.side_pocket_length, m.side_pocket_width, m.side_pocket_distance, m.side_pocket_opening,
      m.chest_full, m.chest_upper, m.chest_front, m.chest_back,
      m.shoulder, m.sleeve_length, m.sleeve_width, m.elbow, m.armhole_front,
      m.waist_front, m.waist_back, m.length_front, m.length_back, m.bottom,
      m.collar_width, m.jabzour_length, m.jabzour_width, m.second_button_distance,
      g.lines, g.small_tabaggi, g.wallet_pocket, g.mobile_pocket, g.pen_holder, g.collar_type
    FROM garments g LEFT JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = ${orderId} ORDER BY g.garment_id
  `);
}

async function main() {
  const orderId = Number(process.argv[2]);
  if (!Number.isInteger(orderId)) { console.error("Usage: apply-mistake-fixes.ts <orderId>"); process.exit(1); }

  const changes = CHANGES[orderId] ?? [];
  const doSlope = SLOPE_ORDERS.has(orderId);
  if (changes.length === 0 && !doSlope) { console.log(`No clear changes defined for order ${orderId}.`); process.exit(0); }

  console.log(`=== BEFORE (order ${orderId}) ===`);
  console.log(JSON.stringify(await snapshot(orderId), null, 2));

  console.log(`\n--- applying ${changes.length} field change(s)${doSlope ? " + slope->normal" : ""} ---`);
  for (const c of changes) {
    const n = await applyChange(c);
    console.log(`${n === 1 ? "OK  " : "MISS"} ${c.garment} ${c.col}: ${c.old} -> ${c.new}  (${n} row)`);
  }
  if (doSlope) {
    const r = await db.execute(sql`
      UPDATE measurements SET shoulder_slope = 'normal'
      WHERE shoulder_slope = 'both_straight'
        AND id IN (SELECT DISTINCT measurement_id FROM garments WHERE order_id = ${orderId} AND measurement_id IS NOT NULL)
    `);
    console.log(`slope->normal: ${(r as { count?: number }).count ?? 0} measurement row(s)`);
  }

  console.log(`\n=== AFTER (order ${orderId}) ===`);
  console.log(JSON.stringify(await snapshot(orderId), null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
