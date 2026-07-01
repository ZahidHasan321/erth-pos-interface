import "dotenv/config";
import * as fs from "fs";
import { parse } from "csv-parse/sync";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== live customers 950 & 1036 (full origin) ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT id, name, phone, nick_name, customer_segment, account_type,
           primary_customer_id, relation, created_at
    FROM customers WHERE id IN (950, 1036) ORDER BY id
  `), null, 2));

  // Any other live customers literally named NASIR on this phone?
  console.log("\n=== any live customer named NASIR / on this phone ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT id, name, phone, created_at FROM customers
    WHERE phone = '99770275' OR upper(name) = 'NASIR' ORDER BY id
  `), null, 2));

  // V10 export freshness
  const D = "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)/FATOURA.csv";
  const stat = fs.statSync(D);
  console.log("\n=== V10 FATOURA.csv file mtime ===", stat.mtime.toISOString());
  const fat: any[] = parse(fs.readFileSync(D), { columns: true, skip_empty_lines: true, relax_column_count: true });
  const dates = fat
    .map((r) => Date.parse(r["INVOICE DATE"] || r["INVOICE DATE REQUESTED"] || ""))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  console.log("rows:", fat.length, "parsable INVOICE DATE:", dates.length);
  console.log("most recent 5 invoice dates:", dates.slice(0, 5).map((d) => new Date(d).toISOString().slice(0, 10)));
  // max invoice number too
  const invs = fat.map((r) => parseInt((r["FATOURA"] || "").replace(/^0+/, ""), 10)).filter(Number.isFinite).sort((a, b) => b - a);
  console.log("max invoice number in V10:", invs.slice(0, 5));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
