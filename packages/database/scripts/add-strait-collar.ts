import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  console.log("Adding COL_STRAIT_COLLAR to styles table for all brands...\n");

  const result = await client.unsafe(`
    INSERT INTO styles (name, type, rate_per_item, image_url, brand)
    SELECT 'Strait Collar', 'collar_type', 0, 'COL_STRAIT_COLLAR', b.brand
    FROM (VALUES ('ERTH'), ('SAKKBA'), ('QASS')) AS b(brand)
    ON CONFLICT (name, type, brand) DO NOTHING
  `);

  console.log(`Rows inserted: ${result.count}`);
  console.log(
    "\nDone! Set rate_per_item for COL_STRAIT_COLLAR in the styles table to the correct price."
  );

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
