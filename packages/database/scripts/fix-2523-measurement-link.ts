import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const WRONG = "fa802b5d-338e-463d-9f2e-55390c207a7b"; // IM0001644 (old, small)
const CORRECT = "a97b7843-d35e-47a2-8799-dbc6a6d76e8c"; // 1036-1 (new, matches Airtable)

async function main() {
  console.log("=== BEFORE ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT g.garment_id, g.measurement_id, m.measurement_id AS label, m.length_back
    FROM garments g JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = 2523 ORDER BY g.garment_id
  `), null, 2));

  const res = await db.execute(sql`
    UPDATE garments
    SET measurement_id = ${CORRECT}
    WHERE order_id = 2523 AND measurement_id = ${WRONG}
  `);
  console.log("\nrows updated:", (res as { count?: number }).count);

  console.log("\n=== AFTER ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT g.garment_id, g.measurement_id, m.measurement_id AS label, m.length_back
    FROM garments g JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = 2523 ORDER BY g.garment_id
  `), null, 2));

  // safety: confirm order 276 (other user of the old record) is untouched
  console.log("\n=== order 276 (must still be on IM0001644) ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT g.garment_id, m.measurement_id AS label
    FROM garments g JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = 276 ORDER BY g.garment_id
  `), null, 2));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
