import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  // Find customer by name
  const cust = await db.execute(sql`
    SELECT id, name, phone, arabic_name, nick_name
    FROM customers
    WHERE name ILIKE '%majid%' OR name ILIKE '%bijle%' OR arabic_name ILIKE '%majid%'
    ORDER BY id
  `);
  console.log("=== Customers matching majid/bijle ===");
  console.log(JSON.stringify(cust, null, 2));

  // Orders with invoice_number 2510 or legacy 2510
  const byInv = await db.execute(sql`
    SELECT o.id AS order_id, o.order_date, o.customer_id, c.name,
           wo.invoice_number, wo.legacy_invoice_number,
           m.second_button_distance
    FROM work_orders wo
    JOIN orders o ON o.id = wo.order_id
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN garments g ON g.order_id = o.id
    LEFT JOIN measurements m ON m.id = g.measurement_id
    WHERE wo.invoice_number = 2510 OR wo.legacy_invoice_number = '2510'
       OR wo.legacy_invoice_number ILIKE '%2510%'
    ORDER BY o.id
  `);
  console.log("\n=== work_orders with invoice/legacy 2510 ===");
  console.log(JSON.stringify(byInv, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
