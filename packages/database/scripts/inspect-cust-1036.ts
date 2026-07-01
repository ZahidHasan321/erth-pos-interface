import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  console.log("=== Customer 1036 ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT id, name, phone, primary_customer_id FROM customers WHERE id = 1036
  `), null, 2));

  console.log("\n=== ALL measurements for customer 1036 ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT id, measurement_id, type, length_front, length_back, shoulder,
           collar_width, chest_full, chest_front, chest_back, chest_upper,
           bottom, waist_front, waist_back, sleeve_length, elbow
    FROM measurements WHERE customer_id = 1036 ORDER BY measurement_id
  `), null, 2));

  console.log("\n=== Order 2523 header ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT id, customer_id, brand, order_type, order_date, status, order_phase
    FROM orders WHERE id = 2523
  `), null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
