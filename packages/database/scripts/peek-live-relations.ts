import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  console.log("live customers:", JSON.stringify(await db.execute(sql`
    SELECT count(*) total,
           count(*) FILTER (WHERE account_type = 'Primary')   AS primary,
           count(*) FILTER (WHERE account_type = 'Secondary') AS secondary,
           count(*) FILTER (WHERE primary_customer_id IS NOT NULL) AS has_fk,
           count(*) FILTER (WHERE relation IS NOT NULL AND relation <> '') AS has_relation
    FROM customers
  `)));
  console.log("\nphones shared by >1 live customer:", JSON.stringify(await db.execute(sql`
    SELECT count(*) FROM (
      SELECT phone FROM customers WHERE phone IS NOT NULL GROUP BY phone HAVING count(*) > 1
    ) t
  `)));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
