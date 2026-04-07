import "dotenv/config";
import { db } from "../src/client";
import { orders } from "../src/schema";
import { inArray } from "drizzle-orm";

async function main() {
  const ids = [65, 66];

  const result = await db
    .select({
      id: orders.id,
      brand: orders.brand,
      checkout_status: orders.checkout_status,
      order_type: orders.order_type,
      order_date: orders.order_date,
      order_total: orders.order_total,
      paid: orders.paid,
    })
    .from(orders)
    .where(inArray(orders.id, ids));

  console.log("Orders 65 & 66:");
  console.table(result);
  process.exit(0);
}
main().catch(console.error);
