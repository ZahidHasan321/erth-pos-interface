import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const DIR =
  "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";

function loadCsv(name: string): Record<string, string>[] {
  return parse(fs.readFileSync(path.join(DIR, name)), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
}

const norm = (s: string | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const invInt = (s: string | undefined) => {
  const n = parseInt((s ?? "").replace(/^0+/, ""), 10);
  return Number.isFinite(n) ? n : null;
};

async function main() {
  // ---- 1. Airtable ground truth ----
  const customers = loadCsv("CUSTOMER.csv");
  // phone -> set of distinct names (find shared-phone collisions)
  const namesByPhone = new Map<string, Set<string>>();
  for (const c of customers) {
    const phone = (c["PHONE"] ?? "").trim();
    const name = norm(c["NAME"]);
    if (!phone || !name) continue;
    if (!namesByPhone.has(phone)) namesByPhone.set(phone, new Set());
    namesByPhone.get(phone)!.add(name);
  }
  const sharedPhones = [...namesByPhone.entries()].filter(([, s]) => s.size > 1);
  console.log(`Airtable customers: ${customers.length}`);
  console.log(`Phones shared by >1 distinct customer name: ${sharedPhones.length}`);

  // invoice(int) -> {name, phone} from FATOURA (the order's true owner)
  const fatoura = loadCsv("FATOURA.csv");
  const ownerByInvoice = new Map<number, { name: string; phone: string }>();
  for (const f of fatoura) {
    const inv = invInt(f["FATOURA"]);
    if (inv == null) continue;
    ownerByInvoice.set(inv, {
      name: norm(f["NAME CUSTOMER"]),
      phone: (f["PHONE CUSTOMER 📞"] ?? f["PHONE CUSTOMER"] ?? "").trim(),
    });
  }
  console.log(`FATOURA rows with invoice#: ${ownerByInvoice.size}`);

  // ---- 2. Live imported orders ----
  const orders = (await db.execute(sql`
    SELECT o.id AS order_id, o.customer_id, c.name AS live_name, c.phone AS live_phone,
           w.legacy_invoice_number AS legacy_inv
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN work_orders w ON w.order_id = o.id
    WHERE w.legacy_invoice_number IS NOT NULL
  `)) as any[];
  console.log(`Live imported WORK orders (have legacy invoice): ${orders.length}`);

  // ---- 3. Compare ----
  let matched = 0,
    noTruth = 0;
  const mismatches: any[] = [];
  for (const o of orders) {
    const inv = typeof o.legacy_inv === "number" ? o.legacy_inv : invInt(String(o.legacy_inv));
    const truth = inv != null ? ownerByInvoice.get(inv) : undefined;
    if (!truth || !truth.name) {
      noTruth++;
      continue;
    }
    if (norm(o.live_name) === truth.name) {
      matched++;
    } else {
      mismatches.push({
        order_id: o.order_id,
        invoice: inv,
        live_customer_id: o.customer_id,
        live_name: o.live_name,
        airtable_name: truth.name,
        phone: truth.phone || o.live_phone,
      });
    }
  }

  console.log(`\n=== RESULT ===`);
  console.log(`matched (live name == airtable invoice name): ${matched}`);
  console.log(`no airtable truth found for invoice:           ${noTruth}`);
  console.log(`MISMATCHED (wrong customer linked):            ${mismatches.length}`);

  // How many mismatches are explained by a shared phone?
  const sharedSet = new Set(sharedPhones.map(([p]) => p));
  const byShared = mismatches.filter((m) => sharedSet.has(m.phone)).length;
  console.log(`  ...of those, on a shared phone:              ${byShared}`);

  console.log(`\n=== Sample mismatches (first 25) ===`);
  console.table(mismatches.slice(0, 25));

  fs.writeFileSync(
    path.join(__dirname, "misattribution-report.json"),
    JSON.stringify(mismatches, null, 2)
  );
  console.log(`\nFull report -> scripts/misattribution-report.json (${mismatches.length} rows)`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
