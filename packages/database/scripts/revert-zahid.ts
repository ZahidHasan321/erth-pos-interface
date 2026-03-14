import "dotenv/config";
import { db } from "../src/client";
import { garments } from "../src/schema";
import { eq } from "drizzle-orm";

async function main() {
  // Revert brova 9-1 back to scheduler state (before plan assignment)
  const result = await db
    .update(garments)
    .set({
      piece_stage: "waiting_cut",
      in_production: true,
      production_plan: null,
      assigned_unit: null,
      assigned_date: null,
      worker_history: null,
      start_time: null,
    })
    .where(eq(garments.garment_id, "9-1"))
    .returning({ id: garments.id, garment_id: garments.garment_id, piece_stage: garments.piece_stage });

  console.log("Reverted:", result);
  process.exit(0);
}

main().catch(console.error);
