import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const dist = (await db.execute(sql`
    SELECT COALESCE(shoulder_slope::text, '(null)') AS v, count(*) AS n
    FROM measurements GROUP BY 1 ORDER BY 2 DESC
  `)) as unknown as Array<{ v: string; n: number }>;
  console.log("shoulder_slope distribution:");
  dist.forEach((d) => console.log(`  ${d.v}: ${d.n}`));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
