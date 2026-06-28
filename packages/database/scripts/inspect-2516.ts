import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const garments = await db.execute(sql`
    SELECT id, order_id, garment_id, garment_type, piece_stage, in_production,
           small_tabaggi, wallet_pocket, pen_holder, mobile_pocket
    FROM garments
    WHERE garment_id = '2516-1' OR order_id = 2516
    ORDER BY garment_id
  `);
  console.log("=== Garments for 2516 ===");
  console.log(JSON.stringify(garments, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
