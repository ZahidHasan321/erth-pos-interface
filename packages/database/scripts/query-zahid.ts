import "dotenv/config";
import { db } from "../src/client";
import { garments, orders, workOrders } from "../src/schema";
import { eq } from "drizzle-orm";

async function main() {
  // Get order 10 garments
  const orderRows = await db.select().from(orders).where(eq(orders.id, 10));
  console.log("=== Order 10 ===");
  console.log(`checkout_status=${orderRows[0]?.checkout_status} order_phase=${(orderRows[0] as any)?.order_phase}`);

  const wo = await db.select().from(workOrders).where(eq(workOrders.order_id, 10));
  if (wo[0]) console.log(`work_order phase=${wo[0].order_phase}`);

  const gs = await db.select().from(garments).where(eq(garments.order_id, 10));
  console.log(`\n=== Garments (${gs.length}) ===`);
  for (const g of gs) {
    console.log(`[${g.garment_id}] type=${g.garment_type} stage=${g.piece_stage} location=${g.location} trip=${g.trip_number} feedback=${g.feedback_status} acceptance=${g.acceptance_status}`);
  }

  process.exit(0);
}

main().catch(console.error);
