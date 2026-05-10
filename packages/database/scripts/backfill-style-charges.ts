/**
 * Recomputes style_price_snapshot per garment and work_orders.style_charge per order
 * using the current styles.rate_per_item per brand.
 *
 * Mirrors apps/pos-interface/src/lib/utils/style-utils.ts:calculateGarmentStylePrice,
 * with backend → frontend jabzour mapping (ZIPPER → JAB_SHAAB).
 *
 * Dry-run by default. Pass --apply to write.
 *
 *   pnpm --filter @repo/database tsx scripts/backfill-style-charges.ts
 *   pnpm --filter @repo/database tsx scripts/backfill-style-charges.ts --apply
 */
import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

type Brand = "ERTH" | "SAKKBA" | "QASS";

function thicknessCode(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.replace(/\s+/g, "_");
}

/** Map backend jabzour_1 (ZIPPER/BUTTON) + jabzour_2 → frontend code used in priceMap. */
function frontendJabzour1(j1: string | null, j2: string | null): string | null {
  if (j1 === "ZIPPER") return "JAB_SHAAB";
  if (j1 === "BUTTON") return j2 || null;
  return j1;
}

function computeStylePrice(g: any, priceMap: Map<string, number>): number {
  if (g.style === "design") return priceMap.get("STY_DESIGNER") ?? 6;
  if (g.collar_type === "COL_QALLABI") return priceMap.get("COL_QALLABI") ?? 5;

  let total = 0;
  if (g.lines === 1) total += priceMap.get("STY_LINE") ?? 0;
  else if (g.lines === 2) total += (priceMap.get("STY_LINE") ?? 0) + (priceMap.get("STY_LINE_2") ?? 0);

  if (g.collar_type) total += priceMap.get(g.collar_type) ?? 0;
  if (g.collar_button) total += priceMap.get(g.collar_button) ?? 0;

  const j1 = frontendJabzour1(g.jabzour_1, g.jabzour_2);
  if (j1) total += priceMap.get(j1) ?? 0;
  const jt = thicknessCode(g.jabzour_thickness);
  if (jt) total += priceMap.get(`JAB_THICKNESS_${jt}`) ?? 0;

  if (g.front_pocket_type) total += priceMap.get(g.front_pocket_type) ?? 0;
  const ft = thicknessCode(g.front_pocket_thickness);
  if (ft) total += priceMap.get(`FRO_THICKNESS_${ft}`) ?? 0;

  if (g.cuffs_type) total += priceMap.get(g.cuffs_type) ?? 0;
  const ct = thicknessCode(g.cuffs_thickness);
  if (ct) total += priceMap.get(`CUF_THICKNESS_${ct}`) ?? 0;

  return total;
}

async function loadPriceMaps(): Promise<Record<Brand, Map<string, number>>> {
  const rows = (await db.execute(sql`
    SELECT brand, code, rate_per_item FROM styles WHERE code IS NOT NULL
  `)) as unknown as { brand: Brand; code: string; rate_per_item: string }[];
  const maps: Record<Brand, Map<string, number>> = {
    ERTH: new Map(),
    SAKKBA: new Map(),
    QASS: new Map(),
  };
  for (const r of rows) {
    if (!maps[r.brand]) continue;
    maps[r.brand].set(r.code, Number(r.rate_per_item) || 0);
  }
  return maps;
}

async function main() {
  const maps = await loadPriceMaps();

  const orders = (await db.execute(sql`
    SELECT o.id, o.brand, wo.style_charge
    FROM orders o
    JOIN work_orders wo ON wo.order_id = o.id
    WHERE o.order_type = 'WORK'
    ORDER BY o.id
  `)) as unknown as { id: number; brand: Brand; style_charge: string | null }[];

  let orderUpdates = 0;
  let garmentUpdates = 0;
  const orderDeltas: Array<{ id: number; brand: Brand; old: number; new: number }> = [];

  for (const o of orders) {
    const garments = (await db.execute(sql`
      SELECT id, garment_id, style, lines, collar_type, collar_button,
             jabzour_1, jabzour_2, jabzour_thickness,
             front_pocket_type, front_pocket_thickness,
             cuffs_type, cuffs_thickness,
             style_price_snapshot
      FROM garments
      WHERE order_id = ${o.id}
    `)) as unknown as any[];

    if (garments.length === 0) continue;
    const priceMap = maps[o.brand];
    if (!priceMap) continue;

    let orderTotal = 0;
    const garmentChanges: Array<{ id: string; old: number; new: number }> = [];

    for (const g of garments) {
      const expected = computeStylePrice(g, priceMap);
      const current = Number(g.style_price_snapshot) || 0;
      orderTotal += expected;
      if (Math.abs(expected - current) > 0.0001) {
        garmentChanges.push({ id: g.id, old: current, new: expected });
      }
    }

    const currentOrderTotal = Number(o.style_charge) || 0;
    if (Math.abs(orderTotal - currentOrderTotal) > 0.0001 || garmentChanges.length > 0) {
      orderDeltas.push({ id: o.id, brand: o.brand, old: currentOrderTotal, new: orderTotal });
      orderUpdates += 1;
      garmentUpdates += garmentChanges.length;

      if (APPLY) {
        for (const change of garmentChanges) {
          await db.execute(sql`
            UPDATE garments SET style_price_snapshot = ${change.new} WHERE id = ${change.id}::uuid
          `);
        }
        await db.execute(sql`
          UPDATE work_orders SET style_charge = ${orderTotal} WHERE order_id = ${o.id}
        `);
      }
    }
  }

  console.log(`\nOrders needing update: ${orderUpdates}`);
  console.log(`Garments needing update: ${garmentUpdates}`);
  if (orderDeltas.length > 0) {
    console.log("\nOrder-level deltas:");
    for (const d of orderDeltas) {
      console.log(`  #${d.id} (${d.brand}): ${d.old.toFixed(3)} → ${d.new.toFixed(3)}`);
    }
  }
  console.log(APPLY ? "\nApplied." : "\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
