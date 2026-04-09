import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);
const BRANDS = ["ERTH", "SAKKBA", "QASS"] as const;

async function main() {
  for (const brand of BRANDS) {
    // Get the current STY_LINE price to copy it as default
    const [existing] = await client`
      SELECT rate_per_item FROM styles
      WHERE code = 'STY_LINE' AND brand = ${brand}
      LIMIT 1
    `;
    const rate = existing?.rate_per_item ?? "0.000";

    await client`
      INSERT INTO styles (name, type, code, component, rate_per_item, brand)
      VALUES ('Line 2', 'lines', 'STY_LINE_2', 'lines', ${rate}, ${brand})
      ON CONFLICT (name, type, brand) DO UPDATE
        SET code = EXCLUDED.code,
            component = EXCLUDED.component
    `;
    console.log(`${brand}: STY_LINE_2 inserted (rate: ${rate})`);
  }
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
