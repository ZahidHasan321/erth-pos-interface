import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  console.log("=== Which orders use each of customer 1036's measurement records ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT m.measurement_id, m.id, COUNT(DISTINCT g.order_id) AS n_orders,
           array_agg(DISTINCT g.order_id) AS orders
    FROM measurements m
    LEFT JOIN garments g ON g.measurement_id = m.id
    WHERE m.customer_id = 1036
    GROUP BY m.measurement_id, m.id
    ORDER BY m.measurement_id
  `), null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
