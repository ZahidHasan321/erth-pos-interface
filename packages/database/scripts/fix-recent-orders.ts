import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Final check for any remaining 'stuck' garments (trip=1 at shop)...");
  const res = await db.execute(sql`
    SELECT order_id, garment_id, trip_number, location, piece_stage
    FROM garments
    WHERE location = 'shop'
      AND piece_stage IN ('waiting_cut', 'waiting_for_acceptance')
      AND trip_number = 1
    LIMIT 100;
  `);
  
  console.log("Stuck items found:", res.length);
  if (res.length > 0) {
    console.log(res);
  } else {
    console.log("No more stuck items. Everything is ready for dispatch!");
  }
  process.exit(0);
}
main().catch(console.error);
