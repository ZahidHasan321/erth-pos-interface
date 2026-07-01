import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  const before = await client`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'alteration_orders'
      AND column_name IN ('cashier_processed_at', 'cashier_processed_by')
    ORDER BY column_name
  `;
  console.log("alteration_orders gate columns BEFORE:", before.map((r) => r.column_name));

  await client.unsafe(`
    ALTER TABLE alteration_orders ADD COLUMN IF NOT EXISTS cashier_processed_at timestamptz;
    ALTER TABLE alteration_orders ADD COLUMN IF NOT EXISTS cashier_processed_by uuid;
  `);

  const after = await client`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'alteration_orders'
      AND column_name IN ('cashier_processed_at', 'cashier_processed_by')
    ORDER BY column_name
  `;
  console.log("alteration_orders gate columns AFTER:", after.map((r) => r.column_name));

  // How many confirmed alterations will land in the Pending queue after this ships.
  const [pending] = await client`
    SELECT COUNT(*)::int AS n
    FROM orders o JOIN alteration_orders a ON a.order_id = o.id
    WHERE o.order_type = 'ALTERATION'
      AND o.checkout_status = 'confirmed'
      AND a.cashier_processed_at IS NULL
  `;
  console.log("confirmed alterations now pending cashier processing:", pending.n);

  console.log("Migration 0041 applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
