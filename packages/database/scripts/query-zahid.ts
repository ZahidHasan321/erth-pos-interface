import "dotenv/config";
import { db } from "../src/client";
import { orders, workOrders, garments } from "../src/schema";
import { eq } from "drizzle-orm";

async function main() {
  const orderId = 5;

  const orderResult = await db
    .select()
    .from(orders)
    .leftJoin(workOrders, eq(workOrders.order_id, orders.id))
    .where(eq(orders.id, orderId));

  console.log("Order 5:");
  console.table(orderResult.map(r => ({ ...r.orders, ...r.work_orders })));

  const garmentResult = await db
    .select({
      id: garments.id,
      garment_type: garments.garment_type,
      piece_stage: garments.piece_stage,
      location: garments.location,
      feedback_status: garments.feedback_status,
      acceptance_status: garments.acceptance_status,
      trip_number: garments.trip_number,
      in_production: garments.in_production,
    })
    .from(garments)
    .where(eq(garments.order_id, orderId));

  console.log("\nGarments:");
  console.table(garmentResult);
  process.exit(0);
}
main().catch(console.error);
