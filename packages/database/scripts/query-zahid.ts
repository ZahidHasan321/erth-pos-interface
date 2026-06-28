import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  // Order + work_order context for 2417 and 2418
  const orders = await db.execute(sql`
    SELECT o.id, o.order_type, o.checkout_status, o.brand, o.paid, o.order_total,
           o.order_date, o.customer_id,
           wo.order_phase, wo.invoice_number, wo.delivery_date, wo.linked_order_id
    FROM orders o
    LEFT JOIN work_orders wo ON wo.order_id = o.id
    WHERE o.id IN (2417, 2418)
    ORDER BY o.id
  `);
  console.log("=== Orders 2417 & 2418 (order + work_order) ===");
  console.log(JSON.stringify(orders, null, 2));

  // Customer info for both
  const customers = await db.execute(sql`
    SELECT DISTINCT c.id, c.name, c.phone, c.primary_customer_id, c.account_type
    FROM customers c
    JOIN orders o ON o.customer_id = c.id
    WHERE o.id IN (2417, 2418)
    ORDER BY c.id
  `);
  console.log("\n=== Customers on these orders ===");
  console.log(JSON.stringify(customers, null, 2));

  // Anything pointing at either order via linked_order_id (group members)
  const group = await db.execute(sql`
    SELECT order_id, invoice_number, linked_order_id, delivery_date,
           COALESCE(linked_order_id, order_id) AS group_key
    FROM work_orders
    WHERE order_id IN (2417, 2418)
       OR linked_order_id IN (2417, 2418)
    ORDER BY group_key, order_id
  `);
  console.log("\n=== Link group membership (COALESCE(linked_order_id, order_id)) ===");
  console.log(JSON.stringify(group, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
