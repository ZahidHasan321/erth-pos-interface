import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  // Order-level context for 88
  const order = await db.execute(sql`
    SELECT o.id, o.order_type, o.checkout_status, o.brand, o.paid, o.order_total,
           o.order_date, wo.order_phase, wo.invoice_number, wo.delivery_date
    FROM orders o
    LEFT JOIN work_orders wo ON wo.order_id = o.id
    WHERE o.id = 88
  `);
  console.log("=== Order 88 (order + work_order) ===");
  console.log(JSON.stringify(order, null, 2));

  // All garments in order 88
  const garments = await db.execute(sql`
    SELECT garment_id, garment_type, piece_stage, location,
           acceptance_status, feedback_status, in_production, trip_number,
           soaking, soaking_completed_at, assigned_unit, assigned_person,
           start_time, completion_time, fabric_source
    FROM garments
    WHERE order_id = 88
    ORDER BY garment_id
  `);
  console.log("\n=== Order 88 garments ===");
  console.log(JSON.stringify(garments, null, 2));

  // Is 88-1 alone, or are other garments stuck at piece_stage='soaking'?
  const stuckSoaking = await db.execute(sql`
    SELECT garment_id, garment_type, location, in_production, trip_number,
           soaking, soaking_completed_at, feedback_status
    FROM garments
    WHERE piece_stage = 'soaking'
    ORDER BY order_id, garment_id
  `);
  console.log("\n=== ALL garments at piece_stage='soaking' ===");
  console.log(JSON.stringify(stuckSoaking, null, 2));

  // FIX: 88-1 is orphaned at piece_stage='soaking' (a parallel-track value no
  // terminal queue reads). Move it to 'sewing' so it surfaces in the sewing
  // terminal. Guarded predicate so this can only touch this one orphaned brova.
  const fix = await db.execute(sql`
    UPDATE garments
    SET piece_stage = 'sewing'
    WHERE order_id = 88
      AND garment_id = '88-1'
      AND piece_stage = 'soaking'
    RETURNING garment_id, piece_stage, location, in_production, trip_number
  `);
  console.log("\n=== FIX applied (88-1 → sewing) ===");
  console.log(JSON.stringify(fix, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
