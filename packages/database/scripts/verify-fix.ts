import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const DIR = "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const BK = "backup_custfix_20260629";
const load = (f: string): any[] => parse(fs.readFileSync(path.join(DIR, f)), { columns: true, skip_empty_lines: true, relax_column_count: true });
const norm = (s: any) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const ph = (s: any) => (s ?? "").trim();
const invInt = (s: any) => { const n = parseInt((s ?? "").replace(/^0+/, ""), 10); return Number.isFinite(n) ? n : null; };
const splitInv = (s: any) => [...new Set((s ?? "").split(/[,\s]+/).map(invInt).filter((n: any) => n != null))] as number[];

async function main() {
  // ---------- CHECK 1: independent source (CUSTOMER.csv rollup, NOT the FATOURA.csv used to fix) ----------
  const customers = load("CUSTOMER.csv");
  const rollup = new Map<number, { name: string; phone: string }[]>(); // invoice -> owning customers per CUSTOMER.FATOURA
  for (const c of customers) for (const inv of splitInv(c["FATOURA"])) {
    if (!rollup.has(inv)) rollup.set(inv, []);
    rollup.get(inv)!.push({ name: norm(c["NAME"]), phone: ph(c["PHONE"]) });
  }
  const orders = (await db.execute(sql`
    SELECT o.id, c.name, c.phone, w.legacy_invoice_number AS inv
    FROM orders o JOIN customers c ON c.id = o.customer_id JOIN work_orders w ON w.order_id = o.id
    WHERE w.legacy_invoice_number IS NOT NULL`)) as any[];

  let confirmed = 0, ambiguousSource = 0, notInRollup = 0, disagree = 0;
  const disagreements: any[] = [];
  for (const o of orders) {
    const inv = typeof o.inv === "number" ? o.inv : invInt(String(o.inv));
    const owners = inv != null ? rollup.get(inv) : undefined;
    if (!owners) { notInRollup++; continue; }
    const liveKey = `${ph(o.phone)}|${norm(o.name)}`;
    const match = owners.some((ow) => `${ow.phone}|${ow.name}` === liveKey);
    if (match && owners.length === 1) confirmed++;          // independent source agrees, unambiguously
    else if (match) ambiguousSource++;                       // matches one of several claimants (reused invoice #)
    else { disagree++; disagreements.push({ id: o.id, inv, live: liveKey, rollup_says: owners.map((x) => `${x.name}@${x.phone}`) }); }
  }
  console.log("=== CHECK 1: independent cross-source (CUSTOMER.csv rollup) ===");
  console.log({ total: orders.length, confirmed_unambiguous: confirmed, confirmed_among_reused_invoice: ambiguousSource, invoice_absent_from_rollup: notInRollup, DISAGREE: disagree });
  if (disagreements.length) { console.log("disagreements (should equal the known reused-invoice flag set):"); console.table(disagreements.slice(0, 20)); }

  // ---------- CHECK 2: blast radius vs backup (prove ONLY intended rows moved) ----------
  const [oc] = (await db.execute(sql.raw(`SELECT count(*)::int n FROM public.orders o JOIN ${BK}.orders b ON b.id=o.id WHERE o.customer_id IS DISTINCT FROM b.customer_id`))) as any[];
  const [oOther] = (await db.execute(sql.raw(`SELECT count(*)::int n FROM public.orders o JOIN ${BK}.orders b ON b.id=o.id
     WHERE o.order_total IS DISTINCT FROM b.order_total OR o.brand IS DISTINCT FROM b.brand OR o.order_date IS DISTINCT FROM b.order_date OR o.order_type IS DISTINCT FROM b.order_type`))) as any[];
  const [oCount] = (await db.execute(sql.raw(`SELECT (SELECT count(*) FROM public.orders) live, (SELECT count(*) FROM ${BK}.orders) bak`))) as any[];
  const [mc] = (await db.execute(sql.raw(`SELECT count(*)::int n FROM public.measurements m JOIN ${BK}.measurements b ON b.id=m.id WHERE m.customer_id IS DISTINCT FROM b.customer_id`))) as any[];
  const [mOther] = (await db.execute(sql.raw(`SELECT count(*)::int n FROM public.measurements m JOIN ${BK}.measurements b ON b.id=m.id WHERE m.measurement_id IS DISTINCT FROM b.measurement_id OR m.length_front IS DISTINCT FROM b.length_front OR m.chest_full IS DISTINCT FROM b.chest_full`))) as any[];
  const [cust] = (await db.execute(sql.raw(`SELECT count(*)::int n FROM public.customers c JOIN ${BK}.customers b ON b.id=c.id WHERE c.name IS DISTINCT FROM b.name OR c.phone IS DISTINCT FROM b.phone`))) as any[];
  console.log("\n=== CHECK 2: blast radius vs backup ===");
  console.log({ orders_customer_id_changed: oc.n, orders_OTHER_cols_changed: oOther.n, orders_count_live_vs_backup: `${oCount.live}/${oCount.bak}`, measurements_customer_id_changed: mc.n, measurements_OTHER_cols_changed: mOther.n, customers_name_or_phone_changed: cust.n });

  // ---------- CHECK 3: integrity ----------
  const [orphan] = (await db.execute(sql`SELECT count(*)::int n FROM orders o WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.id=o.customer_id)`)) as any[];
  const [phoneMismatch] = (await db.execute(sql`
    SELECT count(*)::int n FROM orders o
    JOIN customers c ON c.id=o.customer_id JOIN work_orders w ON w.order_id=o.id
    WHERE w.legacy_invoice_number IS NOT NULL AND c.phone IS NULL`)) as any[];
  console.log("\n=== CHECK 3: integrity ===");
  console.log({ orders_with_missing_customer_FK: orphan.n, imported_orders_customer_has_no_phone: phoneMismatch.n });

  // ---------- CHECK 4: human spot-check (raw CSV vs live) for a sample of CHANGED orders ----------
  const changes = JSON.parse(fs.readFileSync(path.join(__dirname, "fix-changes.json"), "utf8"));
  const fat = load("FATOURA.csv");
  const fatByInv = new Map<number, any>(); for (const f of fat) { const i = invInt(f["FATOURA"]); if (i != null && !fatByInv.has(i)) fatByInv.set(i, f); }
  const sample = changes.filter((_: any, i: number) => i % Math.ceil(changes.length / 10) === 0).slice(0, 10);
  const rows = [] as any[];
  for (const ch of sample) {
    const live = (await db.execute(sql`SELECT c.name, c.phone FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=${ch.order_id}`)) as any[];
    const fr = fatByInv.get(ch.inv);
    rows.push({ order: ch.order_id, inv: ch.inv, was: ch.from_name, "AIRTABLE FATOURA.NAME": fr?.["NAME CUSTOMER"], "NOW live": live[0]?.name, ok: norm(fr?.["NAME CUSTOMER"]) === norm(live[0]?.name) ? "✓" : "✗" });
  }
  console.log("\n=== CHECK 4: spot-check changed orders (raw Airtable invoice vs live now) ===");
  console.table(rows);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
