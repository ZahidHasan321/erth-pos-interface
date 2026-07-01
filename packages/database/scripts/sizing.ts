import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  console.log("=== measurement_date coverage ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE measurement_date IS NULL) AS null_date,
      COUNT(*) FILTER (WHERE measurement_date IS NOT NULL) AS has_date,
      COUNT(*) AS total
    FROM measurements
  `), null, 2));

  console.log("\n=== customers who have BOTH a null-date(old) AND a dated(new) measurement (the at-risk set) ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT COUNT(*) AS at_risk_customers FROM (
      SELECT customer_id
      FROM measurements
      GROUP BY customer_id
      HAVING bool_or(measurement_date IS NULL) AND bool_or(measurement_date IS NOT NULL)
    ) s
  `), null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
