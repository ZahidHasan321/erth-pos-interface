import postgres from "postgres";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  console.log("⚠️  Resetting database...\n");

  // Drop all tables in reverse dependency order
  console.log("Dropping tables...");
  await client.unsafe(`
    DROP TABLE IF EXISTS order_shelf_items CASCADE;
    DROP TABLE IF EXISTS garments CASCADE;
    DROP TABLE IF EXISTS measurements CASCADE;
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS customers CASCADE;
    DROP TABLE IF EXISTS campaigns CASCADE;
    DROP TABLE IF EXISTS styles CASCADE;
    DROP TABLE IF EXISTS fabrics CASCADE;
    DROP TABLE IF EXISTS shelf CASCADE;
    DROP TABLE IF EXISTS prices CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);

  // Drop enums
  console.log("Dropping enums...");
  await client.unsafe(`
    DROP TYPE IF EXISTS role CASCADE;
    DROP TYPE IF EXISTS checkout_status CASCADE;
    DROP TYPE IF EXISTS production_stage CASCADE;
    DROP TYPE IF EXISTS payment_type CASCADE;
    DROP TYPE IF EXISTS discount_type CASCADE;
    DROP TYPE IF EXISTS order_type CASCADE;
    DROP TYPE IF EXISTS fabric_source CASCADE;
    DROP TYPE IF EXISTS account_type CASCADE;
    DROP TYPE IF EXISTS measurement_type CASCADE;
    DROP TYPE IF EXISTS jabzour_type CASCADE;
  `);

  // Drop sequences
  console.log("Dropping sequences...");
  await client.unsafe(`
    DROP SEQUENCE IF EXISTS invoice_seq CASCADE;
  `);

  // Drop functions
  console.log("Dropping functions...");
  await client.unsafe(`
    DROP FUNCTION IF EXISTS complete_work_order CASCADE;
    DROP FUNCTION IF EXISTS complete_sales_order CASCADE;
    DROP FUNCTION IF EXISTS save_work_order_garments CASCADE;
  `);

  console.log("\n✅ Database cleared successfully!");
  console.log("\nNext steps:");
  console.log("  1. Run: pnpm db:push    (to recreate schema)");
  console.log("  2. Run: pnpm db:triggers (to apply triggers)");
  console.log("  3. Run: pnpm db:seed    (optional - to seed data)");

  process.exit(0);
}

main().catch(err => {
  console.error("Error resetting database:", err);
  process.exit(1);
});
