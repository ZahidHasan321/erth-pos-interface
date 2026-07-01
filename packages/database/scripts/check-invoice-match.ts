import "dotenv/config"; import { db } from "../src/client"; import { sql } from "drizzle-orm";
(async()=>{
  const r=await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE legacy_invoice_number IS NOT NULL) AS imported,
      count(*) FILTER (WHERE legacy_invoice_number IS NOT NULL AND invoice_number = legacy_invoice_number) AS match_airtable,
      count(*) FILTER (WHERE legacy_invoice_number IS NOT NULL AND invoice_number <> legacy_invoice_number) AS differ
    FROM work_orders`);
  console.log("current invoice_number vs original Airtable (legacy):", JSON.stringify(r,null,2));
  const sample=await db.execute(sql`SELECT invoice_number AS system_now, legacy_invoice_number AS airtable_original FROM work_orders WHERE legacy_invoice_number IS NOT NULL ORDER BY invoice_number LIMIT 6`);
  console.log("sample:", JSON.stringify(sample));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
