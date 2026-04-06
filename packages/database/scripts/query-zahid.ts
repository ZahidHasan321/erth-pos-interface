import "dotenv/config";
import { db } from "../src/client";
import { garments, orders, workOrders } from "../src/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const ids = [44, 48];
  
  for (const id of ids) {
    console.log(`\n================= ORDER ${id} =================`);
    const orderRows = await db
      .select({
        id: orders.id,
        checkout_status: orders.checkout_status,
        order_type: orders.order_type,
        brand: orders.brand,
        order_phase: workOrders.order_phase,
      })
      .from(orders)
      .leftJoin(workOrders, eq(orders.id, workOrders.order_id))
      .where(eq(orders.id, id));
      
    for (const o of orderRows) console.log(JSON.stringify(o, null, 2));

    console.log(`\n--- GARMENTS FOR ORDER ${id} ---`);
    const rows = await db
      .select({
        id: garments.id,
        garment_id: garments.garment_id,
        garment_type: garments.garment_type,
        piece_stage: garments.piece_stage,
        location: garments.location,
        trip_number: garments.trip_number,
      })
      .from(garments)
      .where(eq(garments.order_id, id));

    for (const g of rows) {
      console.log(JSON.stringify(g, null, 2));
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
