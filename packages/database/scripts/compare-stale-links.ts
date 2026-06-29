/**
 * READ-ONLY evidence for problem C: for each distinct (cur -> expected) pair in
 * stale-measurement-links.json, dump a field-by-field diff of the two measurement
 * records so a human can confirm the EXPECTED (new) record is the right, complete
 * one before any garment is repointed to it.
 *
 * Columns where they differ are shown; "expected_only" = expected has a value the
 * current (old) record lacks; "cur_only" = current has a value expected lacks
 * (a repoint would DROP that value -> needs a careful look).
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const META = new Set([
  "id", "customer_id", "measurer_id", "measurement_date", "measurement_id",
  "idempotency_key", "notes", "reference", "type",
]);

async function main() {
  const flags = JSON.parse(
    fs.readFileSync(path.join(__dirname, "stale-measurement-links.json"), "utf8"),
  ) as any[];

  // distinct cur->expected pairs (orders share a pair)
  const pairs = new Map<string, any>();
  for (const f of flags) {
    const k = `${f.cur_meas_id}->${f.expected_meas_id}`;
    if (!pairs.has(k)) pairs.set(k, f);
  }

  for (const f of pairs.values()) {
    const orders = flags
      .filter((x) => x.cur_meas_id === f.cur_meas_id && x.expected_meas_id === f.expected_meas_id)
      .map((x) => x.order_id);
    const rows = (await db.execute(sql`
      SELECT * FROM measurements WHERE id IN (${f.cur_meas_id}, ${f.expected_meas_id})
    `)) as any[];
    const cur = rows.find((r) => r.id === f.cur_meas_id);
    const exp = rows.find((r) => r.id === f.expected_meas_id);
    if (!cur || !exp) continue;

    const cols = Object.keys(cur).filter((c) => !META.has(c));
    const diffs: any[] = [];
    let curOnly = 0, expOnly = 0;
    for (const c of cols) {
      const a = cur[c], b = exp[c];
      if (String(a ?? "") === String(b ?? "")) continue;
      const note =
        (a == null && b != null) ? "expected_only"
        : (a != null && b == null) ? "CUR_ONLY (repoint drops this)"
        : "differ";
      if (note.startsWith("expected_only")) expOnly++;
      if (note.startsWith("CUR")) curOnly++;
      diffs.push({ field: c, cur: a ?? "—", expected: b ?? "—", note });
    }

    console.log(`\n========================================================`);
    console.log(`orders ${[...new Set(orders)].join(", ")}  |  ${f.customer}`);
    console.log(`CUR (old):      ${f.cur_code}  @${f.cur_date}  id=${f.cur_meas_id}`);
    console.log(`EXPECTED (new): ${f.expected_code}  @${f.expected_date}  id=${f.expected_meas_id}`);
    console.log(`differing fields: ${diffs.length}  | expected-only: ${expOnly}  | CUR-ONLY: ${curOnly}`);
    if (diffs.length) console.table(diffs);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
