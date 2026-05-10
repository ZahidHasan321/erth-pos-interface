import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  // Order 12 garments
  const r = await db.execute(sql`
    SELECT id, garment_id, garment_type, piece_stage, location,
           acceptance_status, feedback_status, trip_number, in_production
    FROM garments
    WHERE order_id = 12
    ORDER BY garment_id
  `);
  console.log("=== Order 12 garments ===");
  console.log(JSON.stringify(r, null, 2));

  // Brovas with feedback_status=accepted but acceptance_status NOT true (old-data bug)
  const stale = await db.execute(sql`
    SELECT id, order_id, garment_id, piece_stage, location,
           acceptance_status, feedback_status, trip_number
    FROM garments
    WHERE garment_type = 'brova'
      AND feedback_status = 'accepted'
      AND (acceptance_status IS NULL OR acceptance_status = false)
    ORDER BY order_id, garment_id
  `);
  console.log("\n=== STALE: brovas accepted but acceptance_status NOT true ===");
  console.log(JSON.stringify(stale, null, 2));

  // Mirror: orders with finals at waiting_for_acceptance AND brovas not accepted
  const stuck = await db.execute(sql`
    SELECT g.id, g.order_id, g.garment_id, g.garment_type, g.piece_stage,
           g.location, g.acceptance_status, g.feedback_status, g.trip_number
    FROM garments g
    WHERE g.order_id IN (
      SELECT DISTINCT order_id FROM garments
      WHERE piece_stage = 'waiting_for_acceptance'
        AND garment_type = 'final'
        AND location = 'workshop'
    )
    ORDER BY g.order_id, g.garment_id
  `);
  console.log("\n=== Orders with parked finals (full breakdown) ===");
  console.log(JSON.stringify(stuck, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
