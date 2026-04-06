import "dotenv/config";
import { db } from "../src/client";
import { garments } from "../src/schema";
import { eq, and } from "drizzle-orm";

async function main() {
  console.log("Fixing Order 48 trip_numbers...");
  const res = await db
    .update(garments)
    .set({ trip_number: 0 })
    .where(eq(garments.order_id, 48));
  
  console.log("Backfill complete.");
  
  // Also check for duplicates and log them
  const rows = await db
    .select()
    .from(garments)
    .where(eq(garments.order_id, 48));
    
  console.log(`Order 48 now has ${rows.length} garments.`);
  for (const r of rows) {
    console.log(`- ${r.id}: ${r.garment_id} (trip: ${r.trip_number})`);
  }
  
  process.exit(0);
}
main().catch(console.error);
