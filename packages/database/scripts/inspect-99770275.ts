import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  console.log("=== Customers with phone 99770275 ===");
  const custs = await db.execute(sql`
    SELECT id, name, nick_name, phone, account_type, primary_customer_id, relation
    FROM customers WHERE phone = '99770275' ORDER BY id
  `);
  console.log(JSON.stringify(custs, null, 2));

  const ids = (custs as any[]).map((c) => c.id);
  console.log("\n=== Orders linked to those customers ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT o.id, o.customer_id, c.name AS linked_name, o.order_type, o.order_date, w.invoice_number, w.legacy_invoice_number
    FROM orders o JOIN customers c ON c.id = o.customer_id
    LEFT JOIN work_orders w ON w.order_id = o.id
    WHERE o.customer_id IN (950, 1036) ORDER BY o.id
  `), null, 2));

  console.log("\n=== Measurements linked to those customers ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT m.id, m.measurement_id, m.customer_id, c.name AS linked_name
    FROM measurements m JOIN customers c ON c.id = m.customer_id
    WHERE m.customer_id IN (950, 1036) ORDER BY m.id
  `), null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
