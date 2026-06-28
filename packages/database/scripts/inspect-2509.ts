import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const garments = await db.execute(sql`
    SELECT g.id, g.order_id, g.garment_id, g.garment_type, g.piece_stage,
           g.measurement_id, g.in_production, m.measurement_id AS m_label,
           m.armhole_front, m.collar_width, m.collar_height,
           m.jabzour_length, m.jabzour_width
    FROM garments g
    LEFT JOIN measurements m ON m.id = g.measurement_id
    WHERE g.garment_id = '2509-1' OR g.order_id = 2509
    ORDER BY g.garment_id
  `);
  console.log("=== Garments for 2509 ===");
  console.log(JSON.stringify(garments, null, 2));

  // Full measurement row(s) for this garment
  const meas = await db.execute(sql`
    SELECT m.*
    FROM garments g
    JOIN measurements m ON m.id = g.measurement_id
    WHERE g.garment_id = '2509-1'
  `);
  console.log("\n=== Full measurement row for 2509-1 ===");
  console.log(JSON.stringify(meas, null, 2));

  // How many garments share this measurement_id (shared group)?
  const shared = await db.execute(sql`
    SELECT g2.garment_id, g2.order_id
    FROM garments g1
    JOIN garments g2 ON g2.measurement_id = g1.measurement_id
    WHERE g1.garment_id = '2509-1'
    ORDER BY g2.garment_id
  `);
  console.log("\n=== Garments sharing this measurement row ===");
  console.log(JSON.stringify(shared, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
