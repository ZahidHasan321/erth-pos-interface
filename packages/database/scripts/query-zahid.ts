import "dotenv/config";
import { db } from "../src/client";
import { garments, orders, workOrders } from "../src/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  // Find brovas with repair/redo feedback or in transit/return paths
  const brovas = await db
    .select()
    .from(garments)
    .where(sql`garment_type = 'brova' AND (feedback_status IN ('needs_repair','needs_redo') OR location = 'transit_to_workshop' OR (piece_stage = 'brova_trialed' AND feedback_status IS NOT NULL))`);

  console.log(`Brovas needing attention: ${brovas.length}`);
  const orderIds = [...new Set(brovas.map((b) => b.order_id))];

  for (const oid of orderIds) {
    const wo = await db.select().from(workOrders).where(eq(workOrders.order_id, oid)).limit(1);
    const o = await db.select().from(orders).where(eq(orders.id, oid)).limit(1);
    const gs = await db.select().from(garments).where(eq(garments.order_id, oid));
    console.log(`\n--- order_id=${oid} | invoice=${wo[0]?.invoice_number} | phase=${wo[0]?.order_phase} | checkout=${o[0]?.checkout_status} ---`);
    for (const g of gs) {
      console.log(`  ${g.garment_id} | type=${g.garment_type} | stage=${g.piece_stage} | loc=${g.location} | trip=${g.trip_number} | fb=${g.feedback_status} | accept=${g.acceptance_status} | in_prod=${g.in_production} | plan=${g.production_plan ? "set" : "null"} | assigned=${g.assigned_date}`);
    }
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
