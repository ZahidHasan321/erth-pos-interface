import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const DIR = "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const load = (f: string): any[] => parse(fs.readFileSync(path.join(DIR, f)), { columns: true, skip_empty_lines: true, relax_column_count: true });
const invInt = (s: any) => { const n = parseInt((s ?? "").replace(/^0+/, ""), 10); return Number.isFinite(n) ? n : null; };
const d = (s: any) => (s ? new Date(s).toISOString().slice(0, 10) : "");

async function main() {
  const flags = JSON.parse(fs.readFileSync(path.join(__dirname, "fix-flags.json"), "utf8"))
    .filter((f: any) => f.reason === "invoice-claimed-by-multiple-customers");

  // every FATOURA row per invoice = each distinct person who used that invoice number
  const fat = load("FATOURA.csv");
  const byInv = new Map<number, any[]>();
  for (const f of fat) { const i = invInt(f["FATOURA"]); if (i == null) continue; if (!byInv.has(i)) byInv.set(i, []); byInv.get(i)!.push(f); }

  const sample = flags.slice(0, 6);
  const out: any[] = [];
  for (const fl of sample) {
    const live = (await db.execute(sql`
      SELECT c.name AS cust, c.phone, o.order_date, o.order_total
      FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ${fl.order_id}`)) as any[];
    const claimants = (byInv.get(fl.inv) ?? []).map((r) => ({
      name: r["NAME CUSTOMER"], phone: (r["PHONE CUSTOMER 📞"] || "").trim(), date: d(r["INVOICE DATE"]),
    }));
    out.push({ order_id: fl.order_id, invoice: fl.inv, live });
    console.log(`\n────────────────────────────────────────────────────────`);
    console.log(`Order #${fl.order_id}  (legacy invoice ${fl.inv})`);
    console.log(`  Currently shown under : ${live[0]?.cust} (${live[0]?.phone})`);
    console.log(`  Order date / total    : ${d(live[0]?.order_date)} / ${live[0]?.order_total}`);
    console.log(`  Airtable reused invoice ${fl.inv} for these DIFFERENT people:`);
    for (const c of claimants) console.log(`     - ${c.name}  (${c.phone})   invoice dated ${c.date}`);
    console.log(`  -> Which person does this order belong to?`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
