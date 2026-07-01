import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const garments = await db.execute(sql`
    SELECT g.id, g.order_id, g.garment_id, g.garment_type, g.piece_stage,
           g.in_production, g.acceptance_status, g.feedback_status,
           g.location, g.trip_number, g.needs_investigation,
           g.redo_priority, g.redo_parked_reason, g.production_plan,
           g.assigned_unit
    FROM garments g
    WHERE g.order_id = 2508
    ORDER BY g.garment_id
  `);
  console.log("=== Garments for order 2508 ===");
  console.log(JSON.stringify(garments, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
