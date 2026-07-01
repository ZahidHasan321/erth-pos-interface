import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  const rows = await db.execute(sql`
    SELECT measurement_id, * FROM measurements
    WHERE id IN ('a97b7843-d35e-47a2-8799-dbc6a6d76e8c','fa802b5d-338e-463d-9f2e-55390c207a7b')
  `);
  const byId: Record<string, any> = {};
  for (const r of rows as any[]) byId[r.measurement_id] = r;
  const a = byId["1036-1"], b = byId["IM0001644"];
  const keys = Object.keys(a).filter(k => !["id","customer_id","measurer_id","measurement_date","measurement_id","idempotency_key","notes","reference"].includes(k));
  console.log("FIELD".padEnd(24), "1036-1 (Airtable/correct)".padEnd(28), "IM0001644 (current/wrong)");
  for (const k of keys) {
    const av = a[k] ?? "—", bv = b[k] ?? "—";
    const flag = String(av) !== String(bv) ? "  <-- DIFF" : "";
    console.log(k.padEnd(24), String(av).padEnd(28), String(bv) + flag);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
