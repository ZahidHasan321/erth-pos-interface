import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  const meas = await db.execute(sql`
    SELECT g.garment_id, m.*
    FROM garments g JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = 2485 ORDER BY g.garment_id
  `);
  console.log(JSON.stringify(meas, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
