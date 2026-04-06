import "dotenv/config";
import { db } from "../src/client";
import { garments } from "../src/schema";
import { eq, inArray, notInArray } from "drizzle-orm";

async function main() {
  console.log("Deduplicating Order 48 garments...");
  
  const allGarments = await db
    .select()
    .from(garments)
    .where(eq(garments.order_id, 48));
    
  const seenIds = new Set<string>();
  const idsToKeep = new Set<string>();
  const idsToDelete = [];
  
  for (const g of allGarments) {
    if (g.garment_id && !seenIds.has(g.garment_id)) {
      seenIds.add(g.garment_id);
      idsToKeep.add(g.id);
    } else {
      idsToDelete.push(g.id);
    }
  }
  
  if (idsToDelete.length > 0) {
    console.log(`Deleting ${idsToDelete.length} duplicate garments...`);
    await db.delete(garments).where(inArray(garments.id, idsToDelete));
  } else {
    console.log("No duplicates found.");
  }
  
  const finalRows = await db
    .select()
    .from(garments)
    .where(eq(garments.order_id, 48));
    
  console.log(`Order 48 now has ${finalRows.length} garments.`);
  for (const r of finalRows) {
    console.log(`- ${r.id}: ${r.garment_id} (trip: ${r.trip_number})`);
  }
  
  process.exit(0);
}
main().catch(console.error);
