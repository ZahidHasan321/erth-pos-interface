import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  console.log("⚠️  Clearing test data (keeping schema)...");

  await client.unsafe(`
    TRUNCATE TABLE 
      garment_feedback,
      order_shelf_items,
      garments,
      work_orders,
      measurements,
      orders,
      customers,
      campaigns,
      styles,
      fabrics,
      shelf,
      prices,
      users
    RESTART IDENTITY CASCADE;
  `);

  console.log("✅ Data cleared successfully!");
  process.exit(0);
}

main().catch(err => {
  console.error("Error clearing data:", err);
  process.exit(1);
});
