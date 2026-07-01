import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  console.log("=== ORDER BY measurement_date DESC (Postgres default null handling) ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, measurement_date
    FROM measurements WHERE customer_id = 1036
    ORDER BY measurement_date DESC
  `), null, 2));

  console.log("\n=== same, explicit NULLS FIRST ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, measurement_date
    FROM measurements WHERE customer_id = 1036
    ORDER BY measurement_date DESC NULLS FIRST
  `), null, 2));

  console.log("\n=== which row is measurements[0] i.e. the FIRST under DESC ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, measurement_date
    FROM measurements WHERE customer_id = 1036
    ORDER BY measurement_date DESC
    LIMIT 1
  `), null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
