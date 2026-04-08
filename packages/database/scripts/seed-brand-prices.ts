import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  console.log("Duplicating prices and styles for SAKKBA and QASS brands...\n");

  // Prices: existing rows now have brand='ERTH' (default). Duplicate for other brands.
  const priceResult = await client.unsafe(`
    INSERT INTO prices (key, brand, value, description, updated_at)
    SELECT key, b.brand, value, description, updated_at
    FROM prices, (VALUES ('SAKKBA'), ('QASS')) AS b(brand)
    WHERE prices.brand = 'ERTH'
    ON CONFLICT (key, brand) DO NOTHING
  `);
  console.log(`Prices duplicated: ${priceResult.count} rows inserted`);

  // Styles: existing rows now have brand='ERTH' (default). Duplicate for other brands.
  const styleResult = await client.unsafe(`
    INSERT INTO styles (name, type, rate_per_item, image_url, code, component, brand)
    SELECT name, type, rate_per_item, image_url, code, component, b.brand
    FROM styles, (VALUES ('SAKKBA'), ('QASS')) AS b(brand)
    WHERE styles.brand = 'ERTH'
    ON CONFLICT (name, type, brand) DO NOTHING
  `);
  console.log(`Styles duplicated: ${styleResult.count} rows inserted`);

  console.log("\nDone!");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
