import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  // 1. Prices: add brand column (PK already dropped by prior push), set new composite PK
  console.log("Migrating prices table...");
  await client.unsafe(`ALTER TABLE prices ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'ERTH'`);
  await client.unsafe(`ALTER TABLE prices ADD PRIMARY KEY (key, brand)`);
  console.log("  prices: done");

  // 2. Styles: add brand column, drop image_url unique, add composite unique
  console.log("Migrating styles table...");
  await client.unsafe(`ALTER TABLE styles ADD COLUMN brand text NOT NULL DEFAULT 'ERTH'`);
  await client.unsafe(`ALTER TABLE styles DROP CONSTRAINT IF EXISTS styles_image_url_unique`);
  await client.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS styles_name_type_brand_idx ON styles (name, type, brand)`);
  console.log("  styles: done");

  // 3. Duplicate existing ERTH data for SAKKBA and QASS
  console.log("Duplicating data for SAKKBA and QASS...");

  const priceResult = await client.unsafe(`
    INSERT INTO prices (key, brand, value, description, updated_at)
    SELECT key, b.brand, value, description, updated_at
    FROM prices, (VALUES ('SAKKBA'), ('QASS')) AS b(brand)
    WHERE prices.brand = 'ERTH'
    ON CONFLICT (key, brand) DO NOTHING
  `);
  console.log(`  prices: ${priceResult.count} rows inserted`);

  const styleResult = await client.unsafe(`
    INSERT INTO styles (name, type, rate_per_item, image_url, brand)
    SELECT name, type, rate_per_item, image_url, b.brand
    FROM styles, (VALUES ('SAKKBA'), ('QASS')) AS b(brand)
    WHERE styles.brand = 'ERTH'
    ON CONFLICT (name, type, brand) DO NOTHING
  `);
  console.log(`  styles: ${styleResult.count} rows inserted`);

  console.log("\nMigration complete!");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
