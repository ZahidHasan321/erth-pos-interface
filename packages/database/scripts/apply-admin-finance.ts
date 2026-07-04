import postgres from "postgres";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

// 0045 reuses is_admin() from triggers.sql and reads the cashier/purchase tables.
// is_admin() must exist; the rest are base tables that always exist.
async function preflight() {
  const rows = await client`SELECT 1 AS ok FROM pg_proc WHERE proname = 'is_admin' LIMIT 1`;
  if (rows.length === 0) {
    throw new Error("Missing dependency is_admin() (apply triggers first).");
  }
}

const EXPECTED_FUNCS = [
  "admin_stock_item_name",
  "admin_finance_summary",
  "admin_transactions_page",
  "admin_registers_page",
  "admin_register_detail",
  "admin_purchases_page",
  "admin_purchase_detail",
];

async function main() {
  console.log("→ Checking dependencies…");
  await preflight();

  const file = "0045_admin_finance_rpcs.sql";
  const sql = fs.readFileSync(path.join(__dirname, "../migrations", file), "utf-8");
  console.log(`→ Applying ${file}…`);
  await client.unsafe(sql);

  // 1. Every function present?
  const present = await client<{ proname: string }[]>`
    SELECT proname FROM pg_proc WHERE proname = ANY(${EXPECTED_FUNCS})`;
  const names = new Set(present.map((r) => r.proname));
  const missing = EXPECTED_FUNCS.filter((n) => !names.has(n));
  if (missing.length) throw new Error(`Functions failed to create: ${missing.join(", ")}`);
  console.log(`✓ ${EXPECTED_FUNCS.length} functions created.`);

  // 2. Real execution as a super_admin (auth.uid() is NULL on a raw connection,
  //    so is_admin() would refuse). Impersonate via the JWT-claim GUC inside a
  //    single transaction; any bad column/table ref makes the RPC throw here.
  await client.begin(async (tx) => {
    const admin = await tx<{ auth_id: string }[]>`
      SELECT auth_id::text AS auth_id FROM users
      WHERE role IN ('super_admin', 'admin') AND is_active = true AND auth_id IS NOT NULL
      LIMIT 1`;
    if (admin.length === 0) {
      console.log("! No admin user with an auth_id found — skipping live-execution check.");
      return;
    }
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: admin[0].auth_id })}, true)`;

    const from = new Date(Date.now() - 90 * 86400000).toISOString();
    const to = new Date(Date.now() + 86400000).toISOString();

    const [summary] = await tx<{ j: any }[]>`SELECT admin_finance_summary(${from}, ${to}, NULL) AS j`;
    const [txns] = await tx<{ j: any }[]>`SELECT admin_transactions_page(NULL, 5, NULL, NULL, NULL, NULL, ${from}, ${to}) AS j`;
    const [regs] = await tx<{ j: any }[]>`SELECT admin_registers_page(${from}, ${to}, NULL, NULL) AS j`;
    const [purch] = await tx<{ j: any }[]>`SELECT admin_purchases_page(NULL, 5, NULL, NULL, NULL, ${from}, ${to}) AS j`;

    console.log("\n── Live RPC results (last 90 days, all brands) ──");
    console.log(`  finance_summary : collected=${summary.j.totals.collected} refunded=${summary.j.totals.refunded} net=${summary.j.totals.net} txns=${summary.j.totals.tx_count}`);
    console.log(`                    methods=${(summary.j.by_method || []).map((m: any) => `${m.payment_type}:${m.net}`).join(", ") || "none"}`);
    console.log(`                    cash_in=${summary.j.cash_flow.cash_in} cash_out=${summary.j.cash_flow.cash_out} payables_outstanding=${summary.j.purchases.outstanding_now_amount}`);
    console.log(`                    registers open=${summary.j.registers.open_count} closed=${summary.j.registers.closed_count} variance=${summary.j.registers.total_variance}`);
    console.log(`  transactions    : ${txns.j.stats?.count ?? 0} total, page returned ${txns.j.data.length}`);
    console.log(`  registers       : ${regs.j.stats.session_count} sessions, expected=${regs.j.stats.total_expected} variance=${regs.j.stats.total_variance}`);
    console.log(`  purchases       : ${purch.j.stats?.count ?? 0} total, outstanding=${purch.j.stats?.total_outstanding ?? 0}`);

    // Exercise the detail RPCs on a real id when one exists.
    const reg0 = regs.j.data[0]?.id;
    if (reg0) {
      const [rd] = await tx<{ j: any }[]>`SELECT admin_register_detail(${reg0}) AS j`;
      console.log(`  register_detail(${reg0}) : expected=${rd.j.reconciliation.expected} counted=${rd.j.reconciliation.counted} movements=${rd.j.cash_movements.length} closes=${rd.j.close_events.length} txns=${rd.j.transactions.length}`);
    }
    const pur0 = purch.j.data[0]?.id;
    if (pur0) {
      const [pd] = await tx<{ j: any }[]>`SELECT admin_purchase_detail(${pur0}) AS j`;
      console.log(`  purchase_detail(${pur0}) : ${pd.j.purchase.item_name ?? "?"} total=${pd.j.purchase.total_cost} paid=${pd.j.purchase.amount_paid} payments=${pd.j.payments.length}`);
    }
  });

  console.log("\n✓ Admin finance RPCs applied and verified.");
  await client.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n✗ Apply failed:", err.message || err);
  await client.end().catch(() => {});
  process.exit(1);
});
