import "dotenv/config";
import { db } from "../src/client";
import { customers, orders, workOrders, garments } from "../src/schema";
import { eq, ilike } from "drizzle-orm";

async function main() {
  const custs = await db.select().from(customers).where(ilike(customers.name, '%fawzan%'));
  console.log("=== Customers matching 'fawzan' ===");
  for (const c of custs) {
    console.log(`  ID: ${c.id}, Name: ${c.name}, Phone: ${c.phone}`);
  }

  for (const cust of custs) {
    const ords = await db.select().from(orders).where(eq(orders.customer_id, cust.id));
    for (const ord of ords) {
      console.log(`\nOrder #${ord.id} | Type: ${ord.order_type} | Status: ${ord.checkout_status}`);
      const wos = await db.select().from(workOrders).where(eq(workOrders.order_id, ord.id));
      for (const wo of wos) {
        console.log(`  Work Order: Invoice=${wo.invoice_number} | Phase=${wo.order_phase} | Delivery=${wo.delivery_date}`);
      }
      const garms = await db.select().from(garments).where(eq(garments.order_id, ord.id));
      for (const g of garms) {
        console.log(`  [${g.garment_id}] type=${g.garment_type} stage=${g.piece_stage} location=${g.location} in_production=${g.in_production} acceptance=${g.acceptance_status}`);
        console.log(`    production_plan=${JSON.stringify(g.production_plan)} worker_history=${JSON.stringify(g.worker_history)}`);
        console.log(`    assigned_date=${g.assigned_date} trip=${g.trip_number}`);
      }
    }
  }
  process.exit(0);
}

main().catch(console.error);
