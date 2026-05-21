/**
 * Seed pre-made shelf items (ready-to-sell stock for SALES orders).
 *
 * Idempotent: upserts on the unique `type` column, so re-running refreshes
 * stock/price rather than creating duplicates.
 *
 * Run: pnpm --filter @repo/database db:seed-shelf
 */

import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

// price is numeric(10,3) — KWD with 3 decimal places.
const items = [
  { type: "Ready Dishdasha - White (S)",  brand: "ERTH",   shop_stock: 25, workshop_stock: 0,  price: "18.500", sku: "ERTH-RD-WHT-S",  low_stock_threshold: 5, description: "Ready-made white dishdasha, small" },
  { type: "Ready Dishdasha - White (M)",  brand: "ERTH",   shop_stock: 40, workshop_stock: 0,  price: "18.500", sku: "ERTH-RD-WHT-M",  low_stock_threshold: 8, description: "Ready-made white dishdasha, medium" },
  { type: "Ready Dishdasha - White (L)",  brand: "ERTH",   shop_stock: 35, workshop_stock: 0,  price: "18.500", sku: "ERTH-RD-WHT-L",  low_stock_threshold: 8, description: "Ready-made white dishdasha, large" },
  { type: "Ready Dishdasha - White (XL)", brand: "ERTH",   shop_stock: 20, workshop_stock: 0,  price: "19.000", sku: "ERTH-RD-WHT-XL", low_stock_threshold: 5, description: "Ready-made white dishdasha, extra large" },
  { type: "Ready Dishdasha - Beige (M)",  brand: "ERTH",   shop_stock: 15, workshop_stock: 0,  price: "19.500", sku: "ERTH-RD-BGE-M",  low_stock_threshold: 4, description: "Ready-made beige dishdasha, medium" },
  { type: "Ghutra - Cotton White",        brand: "ERTH",   shop_stock: 60, workshop_stock: 10, price: "4.500",  sku: "ERTH-GHT-WHT",   low_stock_threshold: 12, description: "White cotton ghutra (headscarf)" },
  { type: "Ghutra - Shemagh Red",         brand: "ERTH",   shop_stock: 45, workshop_stock: 5,  price: "5.000",  sku: "ERTH-GHT-RED",   low_stock_threshold: 10, description: "Red-checked shemagh" },
  { type: "Igal - Standard Black",        brand: "ERTH",   shop_stock: 70, workshop_stock: 0,  price: "3.000",  sku: "ERTH-IGL-BLK",   low_stock_threshold: 15, description: "Standard black igal (cord)" },
  { type: "Bisht - Black Wool",           brand: "ERTH",   shop_stock: 8,  workshop_stock: 2,  price: "85.000", sku: "ERTH-BSH-BLK",   low_stock_threshold: 2, description: "Black wool bisht (cloak)" },
  { type: "SAKKBA Ready Dishdasha - White (M)", brand: "SAKKBA", shop_stock: 30, workshop_stock: 0, price: "21.000", sku: "SAK-RD-WHT-M", low_stock_threshold: 6, description: "SAKKBA ready-made white dishdasha, medium" },
  { type: "SAKKBA Ready Dishdasha - White (L)", brand: "SAKKBA", shop_stock: 28, workshop_stock: 0, price: "21.000", sku: "SAK-RD-WHT-L", low_stock_threshold: 6, description: "SAKKBA ready-made white dishdasha, large" },
  { type: "Faneela - Cotton Undershirt",        brand: "SAKKBA", shop_stock: 50, workshop_stock: 0, price: "2.500",  sku: "SAK-FNL-WHT",  low_stock_threshold: 10, description: "Cotton undershirt worn under dishdasha" },
];

(async () => {
  for (const it of items) {
    await sql`
      INSERT INTO shelf (type, brand, stock, shop_stock, workshop_stock, price, sku, low_stock_threshold, description, default_supplier_id, is_archived)
      VALUES (${it.type}, ${it.brand}, ${it.shop_stock}, ${it.shop_stock}, ${it.workshop_stock}, ${it.price}, ${it.sku}, ${it.low_stock_threshold}, ${it.description}, 1, false)
      ON CONFLICT (type) DO UPDATE SET
        brand = EXCLUDED.brand,
        stock = EXCLUDED.stock,
        shop_stock = EXCLUDED.shop_stock,
        workshop_stock = EXCLUDED.workshop_stock,
        price = EXCLUDED.price,
        sku = EXCLUDED.sku,
        low_stock_threshold = EXCLUDED.low_stock_threshold,
        description = EXCLUDED.description
    `;
    console.log(`  ✓ ${it.type} (${it.brand})`);
  }

  const total = await sql`SELECT COUNT(*)::int AS n FROM shelf`;
  console.log(`\nShelf now has ${total[0].n} item(s).`);
  await sql.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
