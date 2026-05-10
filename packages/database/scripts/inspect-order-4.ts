import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const r = await db.execute(sql`
    SELECT id, garment_id, garment_type,
           collar_type, collar_button, collar_position, collar_thickness,
           cuffs_type, cuffs_thickness,
           front_pocket_type, front_pocket_thickness,
           jabzour_1, jabzour_2, jabzour_thickness
    FROM garments
    WHERE order_id = 4
    ORDER BY garment_id
  `);
  console.log("=== Order 4 garments (style fields) ===");
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
