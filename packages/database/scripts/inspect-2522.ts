import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const garments = await db.execute(sql`
    SELECT g.id, g.order_id, g.garment_id, g.garment_type, g.piece_stage,
           g.measurement_id, g.in_production, g.acceptance_status,
           g.feedback_status, m.measurement_id AS m_label
    FROM garments g
    LEFT JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = 2522
    ORDER BY g.garment_id
  `);
  console.log("=== Garments for order 2522 ===");
  console.log(JSON.stringify(garments, null, 2));

  // Full measurement rows for every garment in the order
  const meas = await db.execute(sql`
    SELECT g.garment_id, m.*
    FROM garments g
    JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = 2522
    ORDER BY g.garment_id
  `);
  console.log("\n=== Full measurement rows per garment in 2522 ===");
  console.log(JSON.stringify(meas, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
