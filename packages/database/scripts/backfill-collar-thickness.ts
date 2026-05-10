import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const before = await db.execute(sql`SELECT COUNT(*)::int AS n FROM garments WHERE collar_thickness IS NULL`);
  console.log("NULL before:", before);

  const r = await db.execute(sql`UPDATE garments SET collar_thickness = 'DOUBLE' WHERE collar_thickness IS NULL`);
  console.log("updated:", r);

  const after = await db.execute(sql`SELECT COUNT(*)::int AS n FROM garments WHERE collar_thickness IS NULL`);
  console.log("NULL after:", after);

  const order4 = await db.execute(sql`
    SELECT garment_id, collar_thickness FROM garments WHERE order_id = 4 ORDER BY garment_id
  `);
  console.log("order 4:", order4);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
