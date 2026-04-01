import "dotenv/config";
import { db } from "../src/client";
import { garments, orders } from "../src/schema";
import { eq } from "drizzle-orm";

async function main() {
  const orderRows = await db
    .select({
      id: orders.id,
      checkout_status: orders.checkout_status,
      order_type: orders.order_type,
      brand: orders.brand,
    })
    .from(orders)
    .where(eq(orders.id, 19));
  console.log("=== ORDER ===");
  for (const o of orderRows) console.log(JSON.stringify(o, null, 2));

  console.log("\n=== GARMENTS ===");
  const rows = await db
    .select({
      garment_id: garments.garment_id,
      garment_type: garments.garment_type,
      piece_stage: garments.piece_stage,
      location: garments.location,
      in_production: garments.in_production,
      trip_number: garments.trip_number,
      feedback_status: garments.feedback_status,
      acceptance_status: garments.acceptance_status,
      production_plan: garments.production_plan,
      assigned_date: garments.assigned_date,
    })
    .from(garments)
    .where(eq(garments.order_id, 19));

  for (const g of rows) {
    console.log(JSON.stringify(g, null, 2));
  }
  process.exit(0);
}
main().catch(console.error);
