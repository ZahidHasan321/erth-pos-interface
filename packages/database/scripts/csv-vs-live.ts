import "dotenv/config";
import * as fs from "fs";
import { parse } from "csv-parse/sync";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const norm = (s: string | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const load = (f: string): any[] => parse(fs.readFileSync(f), { columns: true, skip_empty_lines: true, relax_column_count: true });

async function main() {
  const csv = load("/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)/CUSTOMER.csv");
  const csvKeys = new Set(csv.map((r) => `${(r["PHONE"] || "").trim()}|${norm(r["NAME"])}`));
  const csvByPhone = new Map<string, string[]>();
  for (const r of csv) {
    const p = (r["PHONE"] || "").trim();
    if (!csvByPhone.has(p)) csvByPhone.set(p, []);
    csvByPhone.get(p)!.push(norm(r["NAME"]));
  }

  const live = (await db.execute(sql`SELECT id, name, phone FROM customers`)) as any[];
  let inCsv = 0;
  const notInCsv: any[] = [];
  for (const c of live) {
    const key = `${(c.phone || "").trim()}|${norm(c.name)}`;
    if (csvKeys.has(key)) inCsv++;
    else notInCsv.push({ id: c.id, name: c.name, phone: c.phone, csv_has_for_phone: csvByPhone.get((c.phone || "").trim()) ?? "(phone absent)" });
  }
  console.log(`live customers: ${live.length}`);
  console.log(`matched (phone+name) in V10 Copy CSV: ${inCsv}`);
  console.log(`NOT matched: ${notInCsv.length}`);
  console.log("\n--- first 25 live customers absent from CSV (name the import created but CSV lacks) ---");
  console.table(notInCsv.slice(0, 25));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
