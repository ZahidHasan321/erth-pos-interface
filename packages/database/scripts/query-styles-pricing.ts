import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  const rows = await client`
    SELECT name, code, component, rate_per_item, brand
    FROM styles
    WHERE component IN ('jabzour_type', 'jabzour_thickness', 'pocket_type', 'pocket_thickness', 'cuffs_type', 'cuffs_thickness')
      AND brand = 'ERTH'
    ORDER BY component, name
  `;
  console.table(rows);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
