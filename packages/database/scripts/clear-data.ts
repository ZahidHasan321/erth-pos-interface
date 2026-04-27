import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  console.log("⚠️  Clearing transactional data (keeping catalogs: fabrics, accessories, styles, prices, users, campaigns, units, resources)...");

  await client.unsafe(`
    TRUNCATE TABLE
      notification_reads,
      notifications,
      transfer_request_items,
      transfer_requests,
      register_cash_movements,
      register_sessions,
      appointments,
      payment_transactions,
      order_shelf_items,
      garment_feedback,
      dispatch_log,
      garments,
      alteration_orders,
      work_orders,
      orders,
      measurements,
      customers,
      shelf,
      user_sessions
    RESTART IDENTITY CASCADE;
  `);

  console.log("✅ Transactional data cleared.");
  process.exit(0);
}

main().catch(err => {
  console.error("Error clearing data:", err);
  process.exit(1);
});
