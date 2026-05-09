import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  // 1. All orders with finals stuck at waiting_for_acceptance
  const stuck = await db.execute(sql`
    SELECT
      o.id AS order_id,
      g.id AS garment_uuid,
      g.garment_id,
      g.garment_type,
      g.piece_stage,
      g.location,
      g.acceptance_status,
      g.feedback_status,
      g.in_production,
      g.trip_number
    FROM garments g
    JOIN orders o ON o.id = g.order_id
    WHERE g.piece_stage = 'waiting_for_acceptance'
    ORDER BY o.id, g.garment_id
  `);
  console.log("=== Garments stuck at waiting_for_acceptance ===");
  console.log(JSON.stringify(stuck, null, 2));

  // 2. Brova status per order that has stuck finals
  const stuckOrderIds = [...new Set((stuck as any[]).map((r) => r.order_id))];
  if (stuckOrderIds.length > 0) {
    const brovas = await db.execute(sql`
      SELECT order_id, garment_id, piece_stage, location,
             acceptance_status, feedback_status, trip_number
      FROM garments
      WHERE order_id = ANY(${sql.raw(`ARRAY[${stuckOrderIds.join(",")}]::int[]`)})
        AND garment_type = 'brova'
      ORDER BY order_id, garment_id
    `);
    console.log("\n=== Brovas in those orders ===");
    console.log(JSON.stringify(brovas, null, 2));
  }

  // 3. Check order 12 specifically (user mentioned 12-1)
  const order12 = await db.execute(sql`
    SELECT id, garment_id, garment_type, piece_stage, location,
           acceptance_status, feedback_status, trip_number, in_production
    FROM garments
    WHERE order_id = 12
    ORDER BY garment_id
  `);
  console.log("\n=== Order 12 garments ===");
  console.log(JSON.stringify(order12, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
