import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const rows = await db.execute(sql`
    SELECT g.garment_id, g.garment_type, g.piece_stage, g.measurement_id,
           m.measurement_id AS m_label,
           m.collar_width, m.collar_height,
           m.side_pocket_distance, m.side_pocket_opening
    FROM garments g
    LEFT JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = 2513
    ORDER BY g.garment_id
  `);
  console.log("=== 2513 garments + collar/side-pkt measurements ===");
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
