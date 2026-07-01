import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  // measurer + full provenance of the two measurements
  console.log("=== provenance ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, type, measurer_id, measurement_date, idempotency_key
    FROM measurements WHERE customer_id = 1036 ORDER BY measurement_date NULLS LAST
  `), null, 2));

  // Did order 276 (old) actually use IM0001644 originally? confirm garments
  console.log("\n=== order 276 garments ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT garment_id, garment_type, measurement_id FROM garments WHERE order_id = 276 ORDER BY garment_id
  `), null, 2));

  // Were any OTHER orders created on 2026-06-28 and what measurement age did they link?
  console.log("\n=== orders on 2026-06-28 and the measurement they linked (new vs migrated) ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT o.id AS order_id, o.order_date,
           m.measurement_id, m.measurement_date,
           (m.idempotency_key IS NOT NULL) AS made_in_new_system
    FROM orders o
    JOIN garments g ON g.order_id = o.id AND g.garment_id = o.id::text || '-1'
    JOIN measurements m ON m.id = g.measurement_id
    WHERE o.order_date::date = '2026-06-28'
    ORDER BY o.id
  `), null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
