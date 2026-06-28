import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const GARMENT_ID = "c8a30680-2a6e-4dd9-9665-f69a67c429ae"; // 2516-1 (brova)

async function main() {
  console.log("=== BEFORE ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT garment_id, small_tabaggi FROM garments WHERE id = ${GARMENT_ID}
  `), null, 2));

  await db.execute(sql`
    UPDATE garments SET small_tabaggi = false WHERE id = ${GARMENT_ID}
  `);

  console.log("=== AFTER ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT garment_id, small_tabaggi FROM garments WHERE id = ${GARMENT_ID}
  `), null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
