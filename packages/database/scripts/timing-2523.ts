import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  console.log("=== Orders 2523 & 276 (order_date) ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT id, customer_id, order_date FROM orders WHERE id IN (2523, 276) ORDER BY id
  `), null, 2));

  console.log("\n=== Customer 1036 measurements (id-pattern + idempotency) ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, type, measurement_date, idempotency_key
    FROM measurements WHERE customer_id = 1036 ORDER BY measurement_id
  `), null, 2));

  console.log("\n=== Order id boundary: highest order_date around migration ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT min(order_date) AS earliest, max(order_date) AS latest, max(id) AS max_id FROM orders
  `), null, 2));

  console.log("\n=== a few orders around 2470-2480 to see the migration boundary ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT id, order_date FROM orders WHERE id BETWEEN 2468 AND 2485 ORDER BY id
  `), null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
