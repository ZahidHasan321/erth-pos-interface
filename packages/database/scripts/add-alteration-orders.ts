import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

/**
 * Apply the ALTERATION(out) schema changes without invoking drizzle-kit push
 * (which currently fails because assigned_order_agg is a VIEW declared in
 * triggers.sql rather than schema.ts, and drizzle-kit tries to DROP TABLE it).
 *
 * Idempotent — uses IF NOT EXISTS everywhere.
 *
 * Changes:
 *  1. Extend order_type enum with 'ALTERATION'
 *  2. Create alteration_orders table + unique index on invoice_number
 *  3. Add alteration-only columns to garments
 *  4. Run triggers.sql separately via `pnpm db:triggers` to install the
 *     alteration_invoice_seq sequence and next_alteration_invoice() RPC.
 */
async function main() {
  // 1. Enum value (Postgres 14+ supports IF NOT EXISTS on enum add)
  await db.execute(sql`
    ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'ALTERATION'
  `);
  console.log("OK: order_type enum includes 'ALTERATION'");

  // 2. alteration_orders table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alteration_orders (
      order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      invoice_number INTEGER,
      received_date TIMESTAMP,
      order_phase order_phase DEFAULT 'new',
      alteration_total NUMERIC(10, 3),
      comments TEXT
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS alteration_orders_invoice_idx
      ON alteration_orders(invoice_number)
  `);
  console.log("OK: alteration_orders table + unique invoice index");

  // 3. Garment columns for alteration garments
  await db.execute(sql`
    ALTER TABLE garments
      ADD COLUMN IF NOT EXISTS alteration_measurements JSONB,
      ADD COLUMN IF NOT EXISTS alteration_issues JSONB,
      ADD COLUMN IF NOT EXISTS custom_price NUMERIC(10, 3),
      ADD COLUMN IF NOT EXISTS bufi_ext TEXT
  `);
  console.log("OK: garments has alteration_measurements, alteration_issues, custom_price, bufi_ext");

  console.log("");
  console.log("Done. Next: run `pnpm --filter @repo/database db:triggers` to install");
  console.log("the alteration_invoice_seq sequence and next_alteration_invoice() RPC.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
