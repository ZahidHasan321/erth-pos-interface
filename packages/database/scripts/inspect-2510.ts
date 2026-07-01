import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const order = await db.execute(sql`
    SELECT o.id, o.order_date, o.customer_id, o.brand,
           c.name AS customer_name, c.phone,
           wo.invoice_number, wo.legacy_invoice_number
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN work_orders wo ON wo.order_id = o.id
    WHERE o.id = 2510
  `);
  console.log("=== Order 2510 ===");
  console.log(JSON.stringify(order, null, 2));

  const garments = await db.execute(sql`
    SELECT g.id, g.garment_id, g.garment_type, g.piece_stage,
           g.measurement_id, m.measurement_id AS m_label,
           m.second_button_distance, m.measurement_date
    FROM garments g
    LEFT JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = 2510
    ORDER BY g.garment_id
  `);
  console.log("\n=== Garments + measurement.second_button_distance ===");
  console.log(JSON.stringify(garments, null, 2));

  // Full measurement row
  const meas = await db.execute(sql`
    SELECT m.*
    FROM garments g
    JOIN measurements m ON m.id = g.measurement_id
    WHERE g.order_id = 2510
    LIMIT 1
  `);
  console.log("\n=== Full measurement row ===");
  console.log(JSON.stringify(meas, null, 2));

  // How many measurements rows overall have a non-null second_button_distance?
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) AS total,
      COUNT(second_button_distance) AS with_2nd_btn,
      COUNT(*) FILTER (WHERE second_button_distance IS NOT NULL AND second_button_distance <> 0) AS nonzero_2nd_btn
    FROM measurements
  `);
  console.log("\n=== second_button_distance fill stats (all measurements) ===");
  console.log(JSON.stringify(stats, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
