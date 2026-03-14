import "dotenv/config";
import { db } from "../src/client";
import { customers, orders, workOrders, garments } from "../src/schema";
import { eq, ilike, sql } from "drizzle-orm";

async function main() {
  // Find customer
  const custs = await db.select().from(customers).where(ilike(customers.name, '%zahid%'));
  console.log("=== Customers matching 'zahid' ===");
  for (const c of custs) {
    console.log(`  ID: ${c.id}, Name: ${c.name}, Phone: ${c.phone}`);
  }

  if (custs.length === 0) {
    // Maybe zahid is the order taker - check users table
    console.log("\nNo customer named zahid found. Checking if zahid is an order taker...");
    const result = await db.execute(sql`SELECT id, name, email FROM users WHERE name ILIKE '%zahid%'`);
    console.log("Users:", result);
    process.exit(0);
  }

  for (const cust of custs) {
    console.log(`\n=== Orders for ${cust.name} (ID: ${cust.id}) ===`);
    const ords = await db.select().from(orders).where(eq(orders.customer_id, cust.id));

    for (const ord of ords) {
      console.log(`\n  Order #${ord.id} | Type: ${ord.order_type} | Status: ${ord.checkout_status} | Date: ${ord.order_date}`);
      console.log(`    Brand: ${ord.brand} | Total: ${ord.total_amount} | Paid: ${ord.paid_amount}`);

      // Work order details
      const wos = await db.select().from(workOrders).where(eq(workOrders.order_id, ord.id));
      for (const wo of wos) {
        console.log(`    Work Order: Invoice=${wo.invoice_number} | Phase=${wo.order_phase} | Delivery=${wo.delivery_date}`);
      }

      // Garments
      const garms = await db.select().from(garments).where(eq(garments.order_id, ord.id));
      console.log(`    Garments (${garms.length}):`);
      for (const g of garms) {
        console.log(`      [${g.garment_id}] Type: ${g.garment_type} | Stage: ${g.piece_stage} | Location: ${g.location} | Style: ${g.style}`);
        console.log(`        in_production: ${g.in_production} | Acceptance: ${g.acceptance_status} | assigned_unit: ${g.assigned_unit} | assigned_date: ${g.assigned_date}`);
        console.log(`        production_plan: ${JSON.stringify(g.production_plan)} | worker_history: ${JSON.stringify(g.worker_history)}`);
        if (g.trip_number) console.log(`        Trip: ${g.trip_number}`);
        if (g.dispatch_date) console.log(`        Dispatched: ${g.dispatch_date}`);
        if (g.received_date) console.log(`        Received: ${g.received_date}`);
      }
    }
  }

  process.exit(0);
}

main().catch(console.error);
