/**
 * Re-point migration-imported orders to their TRUE customer.
 *
 * Bug: import-airtable.ts linked orders to a customer by PHONE alone, but phones
 * are shared by family members, so all orders on a shared phone collapsed onto
 * one customer (the last inserted for that phone).
 *
 * Truth source: CUSTOMER.csv.FATOURA (each Airtable customer's own invoice list)
 * cross-checked with FATOURA.csv (invoice -> NAME CUSTOMER + phone).
 *
 * Safety:
 *  - ONLY touches orders WHERE legacy_invoice_number IS NOT NULL (imported rows).
 *    New orders (legacy NULL) are never read or written.
 *  - Only changes orders.customer_id; nothing else.
 *  - DRY RUN unless --apply is passed.
 *
 * Live-id resolution per phone: exact normalized-name match first; remaining
 * unmatched csv<->live pairs resolved by 1:1 elimination (handles in-app renames
 * like "NASIR" -> "ABDUL AZIZ"); >1 leftover is flagged ambiguous (no change).
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const DIR = "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const load = (f: string): any[] => parse(fs.readFileSync(path.join(DIR, f)), { columns: true, skip_empty_lines: true, relax_column_count: true });
const norm = (s: string | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const phoneNorm = (s: string | undefined) => (s ?? "").trim();
const invInt = (s: string | undefined) => { const n = parseInt((s ?? "").replace(/^0+/, ""), 10); return Number.isFinite(n) ? n : null; };
const splitInv = (s: string | undefined) => [...new Set((s ?? "").split(/[,\s]+/).map(invInt).filter((n): n is number => n != null))];

async function main() {
  const customers = load("CUSTOMER.csv");
  const fatoura = load("FATOURA.csv");

  // 1. invoice -> owning customer (name, phone) from FATOURA.csv: the order's OWN
  // record, 1 row per invoice. Authoritative (CUSTOMER.csv.FATOURA rollup can list
  // one invoice under two customers; FATOURA.csv does not).
  type Owner = { name: string; phone: string };
  const invoiceOwner = new Map<number, Owner>();
  const invoiceConflict = new Set<number>();
  for (const f of fatoura) {
    const inv = invInt(f["FATOURA"]);
    if (inv == null) continue;
    const owner: Owner = { name: norm(f["NAME CUSTOMER"]), phone: phoneNorm(f["PHONE CUSTOMER 📞"] ?? f["PHONE CUSTOMER"]) };
    const prev = invoiceOwner.get(inv);
    if (prev && (prev.name !== owner.name || prev.phone !== owner.phone)) invoiceConflict.add(inv);
    invoiceOwner.set(inv, owner);
  }
  // csv recid lookup by phone|name (to bridge a FATOURA owner to the Airtable
  // customer record, then to the live id even when the live row was renamed)
  const recidByKey = new Map<string, string>();
  for (const c of customers) { const k = `${phoneNorm(c["PHONE"])}|${norm(c["NAME"])}`; if (!recidByKey.has(k)) recidByKey.set(k, c["airtable_id"]); }

  // 2. live customers
  const live = (await db.execute(sql`SELECT id, name, phone FROM customers`)) as any[];
  const liveByPhone = new Map<string, { id: number; name: string }[]>();
  for (const c of live) { const p = phoneNorm(c.phone); if (!liveByPhone.has(p)) liveByPhone.set(p, []); liveByPhone.get(p)!.push({ id: c.id, name: c.name }); }

  // csv customers grouped by phone
  const csvByPhone = new Map<string, { recid: string; name: string }[]>();
  for (const c of customers) { const p = phoneNorm(c["PHONE"]); if (!p) continue; if (!csvByPhone.has(p)) csvByPhone.set(p, []); csvByPhone.get(p)!.push({ recid: c["airtable_id"], name: norm(c["NAME"]) }); }

  // 3. resolve recid -> live id (exact name, then 1:1 elimination)
  const recidToLive = new Map<string, { id: number; method: string }>();
  for (const [phone, csvRows] of csvByPhone) {
    const liveRows = (liveByPhone.get(phone) ?? []).slice();
    const usedLive = new Set<number>();
    const leftover: { recid: string }[] = [];
    for (const cr of csvRows) {
      const m = liveRows.find((l) => !usedLive.has(l.id) && norm(l.name) === cr.name);
      if (m) { usedLive.add(m.id); recidToLive.set(cr.recid, { id: m.id, method: "exact" }); }
      else leftover.push({ recid: cr.recid });
    }
    const liveLeft = liveRows.filter((l) => !usedLive.has(l.id));
    if (leftover.length === 1 && liveLeft.length === 1) recidToLive.set(leftover[0].recid, { id: liveLeft[0].id, method: "eliminated" });
    else for (const lo of leftover) recidToLive.set(lo.recid, { id: -1, method: liveLeft.length === 0 ? "no-live" : "ambiguous" });
  }

  // 4. walk imported orders
  const orders = (await db.execute(sql`
    SELECT o.id AS order_id, o.customer_id, c.name AS cur_name, c.phone AS cur_phone, w.legacy_invoice_number AS inv
    FROM orders o JOIN customers c ON c.id = o.customer_id JOIN work_orders w ON w.order_id = o.id
    WHERE w.legacy_invoice_number IS NOT NULL
  `)) as any[];

  const changes: any[] = [];
  const flags: any[] = [];
  let already = 0;
  for (const o of orders) {
    const inv = typeof o.inv === "number" ? o.inv : invInt(String(o.inv));
    if (inv == null) { flags.push({ ...slim(o), reason: "bad-invoice" }); continue; }
    const owner = invoiceOwner.get(inv);
    if (!owner || !owner.name) { flags.push({ ...slim(o), inv, reason: "no-fatoura-owner" }); continue; }
    if (invoiceConflict.has(inv)) { flags.push({ ...slim(o), inv, reason: "invoice-claimed-by-multiple-customers" }); continue; }

    // resolve owner (phone,name) -> live customer id
    let target: { id: number; method: string } | null = null;
    const recid = recidByKey.get(`${owner.phone}|${owner.name}`);
    if (recid) { const t = recidToLive.get(recid); if (t && t.id > 0) target = t; }
    if (!target) {
      const onPhone = liveByPhone.get(owner.phone) ?? [];
      const exact = onPhone.filter((l) => norm(l.name) === owner.name);
      if (exact.length === 1) target = { id: exact[0].id, method: "live-exact" };
      else if (onPhone.length === 1) target = { id: onPhone[0].id, method: "single-on-phone" };
    }
    if (!target) { flags.push({ ...slim(o), inv, owner_name: owner.name, owner_phone: owner.phone, reason: "unresolved-live" }); continue; }
    if (target.id === o.customer_id) { already++; continue; }
    changes.push({ order_id: o.order_id, inv, from_id: o.customer_id, from_name: o.cur_name, to_id: target.id, to_name: owner.name, method: target.method });
  }

  console.log(`imported orders examined: ${orders.length}`);
  console.log(`already correct:          ${already}`);
  console.log(`TO RE-POINT:              ${changes.length}`);
  console.log(`   by exact name:         ${changes.filter((c) => c.method === "exact").length}`);
  console.log(`   by elimination:        ${changes.filter((c) => c.method === "eliminated").length}`);
  console.log(`FLAGGED (no change):      ${flags.length}`);
  const fb: Record<string, number> = {}; for (const f of flags) fb[f.reason] = (fb[f.reason] || 0) + 1;
  console.log(`   flag breakdown:`, fb);

  fs.writeFileSync(path.join(__dirname, "fix-changes.json"), JSON.stringify(changes, null, 2));
  fs.writeFileSync(path.join(__dirname, "fix-flags.json"), JSON.stringify(flags, null, 2));
  console.log(`\nsample changes:`); console.table(changes.slice(0, 15));

  if (!APPLY) { console.log(`\nDRY RUN. Re-run with --apply to write ${changes.length} updates.`); process.exit(0); }

  console.log(`\nAPPLYING ${changes.length} updates...`);
  let done = 0;
  for (const ch of changes) {
    await db.execute(sql`UPDATE orders SET customer_id = ${ch.to_id} WHERE id = ${ch.order_id}`);
    done++;
  }
  console.log(`applied ${done} updates.`);
  process.exit(0);
}
const slim = (o: any) => ({ order_id: o.order_id, from_id: o.customer_id, from_name: o.cur_name });
main().catch((e) => { console.error(e); process.exit(1); });
