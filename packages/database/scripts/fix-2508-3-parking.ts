import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

// Revert 2508-3: accidentally moved parking -> scheduler via sendToScheduler.
// That set in_production=true, piece_stage=waiting_cut, production_plan=null.
// Restore it to the parked "waiting_for_acceptance" state, mirroring its
// sibling final 2508-2 (same order/brova => identical inherited plan).

async function show(label: string) {
  const rows = await db.execute(sql`
    SELECT garment_id, piece_stage, in_production, production_plan
    FROM garments WHERE order_id = 2508 ORDER BY garment_id
  `);
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(rows, null, 2));
}

async function main() {
  await show("BEFORE");

  const res = await db.execute(sql`
    UPDATE garments AS tgt
    SET piece_stage = 'waiting_for_acceptance',
        in_production = false,
        production_plan = sib.production_plan
    FROM garments AS sib
    WHERE tgt.garment_id = '2508-3'
      AND sib.garment_id = '2508-2'
      AND tgt.order_id = 2508
      AND sib.order_id = 2508
    RETURNING tgt.garment_id
  `);
  console.log(`\nRows updated: ${(res as any[]).length}`);

  await show("AFTER");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
