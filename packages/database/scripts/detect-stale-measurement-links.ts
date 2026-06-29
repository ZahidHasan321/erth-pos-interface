/**
 * READ-ONLY detector for problem C: post-migration WORK orders whose garment is
 * linked to an OLD measurement when a newer data-bearing one existed for that
 * customer at order time (the fabric-form auto-select bug + staff not switching).
 *
 * Rule (user-chosen): "newest-with-data for that customer".
 *   For a garment on order O (customer C, date D), the EXPECTED measurement is
 *   the newest data-bearing measurement of C whose effective date <= D + slack.
 *   If the garment points to a different / older / dataless measurement, flag it.
 *
 * Scope (user-chosen): post-migration only (work_orders.legacy_invoice_number IS NULL).
 *
 * Effective date = COALESCE(measurement_date, earliest linked order_date), so this
 * works whether or not backfill-measurement-dates.ts has been applied.
 *
 * Writes nothing. Emits scripts/stale-measurement-links.json for review.
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

// Same-session slack only: a measurement may post a few minutes after the order
// row. A measurement dated a full day+ later is a DIFFERENT event (later order /
// feedback correction) and must not be treated as "what this order should use".
const SLACK_DAYS = 0.5;
const day = (s: any) => (s ? new Date(s).getTime() / 86400000 : null);

type Meas = {
  id: string;
  customer_id: number;
  code: string | null;
  has_data: boolean;
  eff_date: string | null;
};

async function main() {
  // 1. Every measurement with its effective date + has-data flag.
  const meas = (await db.execute(sql`
    SELECT m.id, m.customer_id, m.measurement_id AS code,
           (m.length_front IS NOT NULL OR m.length_back IS NOT NULL OR m.bottom IS NOT NULL
            OR m.shoulder IS NOT NULL OR m.collar_width IS NOT NULL) AS has_data,
           COALESCE(m.measurement_date, mo.first_order) AS eff_date
    FROM measurements m
    LEFT JOIN (
      SELECT g.measurement_id AS mid, MIN(o.order_date) AS first_order
      FROM garments g JOIN orders o ON o.id = g.order_id
      GROUP BY g.measurement_id
    ) mo ON mo.mid = m.id
  `)) as Meas[];

  const byCustomer = new Map<number, Meas[]>();
  const byId = new Map<string, Meas>();
  for (const m of meas) {
    byId.set(m.id, m);
    if (!byCustomer.has(m.customer_id)) byCustomer.set(m.customer_id, []);
    byCustomer.get(m.customer_id)!.push(m);
  }

  // 2. Post-migration WORK-order garments that carry a measurement.
  const rows = (await db.execute(sql`
    SELECT o.id AS order_id, o.order_date, o.customer_id,
           c.name AS customer_name, g.garment_id, g.measurement_id AS cur_mid
    FROM orders o
    JOIN work_orders w ON w.order_id = o.id AND w.legacy_invoice_number IS NULL
    JOIN customers c ON c.id = o.customer_id
    JOIN garments g ON g.order_id = o.id AND g.measurement_id IS NOT NULL
    ORDER BY o.id
  `)) as any[];

  const flags: any[] = [];
  for (const r of rows) {
    const cur = byId.get(r.cur_mid);
    if (!cur) continue;
    const od = day(r.order_date)!;
    // Candidate "expected" = newest data-bearing meas for this customer at/around order time.
    const candidates = (byCustomer.get(r.customer_id) ?? []).filter(
      (m) => m.has_data && (day(m.eff_date) ?? Infinity) <= od + SLACK_DAYS,
    );
    candidates.sort((a, b) => (day(b.eff_date) ?? 0) - (day(a.eff_date) ?? 0));
    const expected = candidates[0];
    if (!expected) continue;
    if (expected.id === cur.id) continue; // already on the right one

    // Flag only when the garment is on something genuinely worse: dataless, or
    // strictly older than the expected newest.
    const curIsWorse =
      !cur.has_data || (day(expected.eff_date) ?? 0) > (day(cur.eff_date) ?? 0);
    if (!curIsWorse) continue;

    flags.push({
      order_id: r.order_id,
      order_date: String(r.order_date).slice(0, 10),
      customer_id: r.customer_id,
      customer: r.customer_name,
      garment_id: r.garment_id,
      cur_meas_id: cur.id,
      cur_code: cur.code,
      cur_date: cur.eff_date ? String(cur.eff_date).slice(0, 10) : null,
      cur_has_data: cur.has_data,
      expected_meas_id: expected.id,
      expected_code: expected.code,
      expected_date: expected.eff_date ? String(expected.eff_date).slice(0, 10) : null,
      reason: !cur.has_data ? "linked-to-dataless" : "linked-to-older",
    });
  }

  // group by order for a readable summary
  const orderIds = new Set(flags.map((f) => f.order_id));
  console.log(`post-migration WORK garments examined: ${rows.length}`);
  console.log(`FLAGGED garments: ${flags.length} across ${orderIds.size} orders`);
  const byReason: Record<string, number> = {};
  for (const f of flags) byReason[f.reason] = (byReason[f.reason] || 0) + 1;
  console.log(`reason breakdown:`, byReason);
  console.log(`\nsample (first 20):`);
  console.table(
    flags.slice(0, 20).map((f) => ({
      order: f.order_id,
      date: f.order_date,
      customer: f.customer,
      garment: f.garment_id,
      cur: `${f.cur_code}${f.cur_has_data ? "" : " (empty)"} @${f.cur_date}`,
      expected: `${f.expected_code} @${f.expected_date}`,
      why: f.reason,
    })),
  );

  fs.writeFileSync(
    path.join(__dirname, "stale-measurement-links.json"),
    JSON.stringify(flags, null, 2),
  );
  console.log(`\nFull report -> scripts/stale-measurement-links.json`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
