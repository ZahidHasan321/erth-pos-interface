import "dotenv/config";
import { db } from "../src/client";
import { garments } from "../src/schema";
import { eq, and, inArray } from "drizzle-orm";

async function main() {
  console.log("Starting general backfill for garments (trip_number 1 -> 0 if at shop)...");
  
  const res = await db
    .update(garments)
    .set({ trip_number: 0 })
    .where(
        and(
            eq(garments.location, "shop"),
            inArray(garments.piece_stage as any, ["waiting_cut", "waiting_for_acceptance"]),
            eq(garments.trip_number, 1)
        )
    );
  
  console.log("General backfill complete.");
  process.exit(0);
}
main().catch(console.error);
