import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const total = await db.execute(sql`SELECT COUNT(*)::int AS n FROM garments`);
  const nulls = await db.execute(sql`SELECT COUNT(*)::int AS n FROM garments WHERE collar_thickness IS NULL`);
  const dist = await db.execute(sql`
    SELECT COALESCE(collar_thickness, '<NULL>') AS v, COUNT(*)::int AS n
    FROM garments GROUP BY collar_thickness ORDER BY n DESC
  `);
  console.log("total:", total);
  console.log("null:", nulls);
  console.log("distribution:", dist);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
