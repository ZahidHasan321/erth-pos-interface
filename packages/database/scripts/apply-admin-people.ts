import postgres from "postgres";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

// 0047 reuses is_admin() from triggers.sql and reads customers/orders base tables.
async function preflight() {
  const rows = await client`SELECT 1 AS ok FROM pg_proc WHERE proname = 'is_admin' LIMIT 1`;
  if (rows.length === 0) {
    throw new Error("Missing dependency is_admin() (apply triggers first).");
  }
}

// Grows as later phases append RPCs to 0047.
const EXPECTED_FUNCS = [
  "admin_customer_detail",
  "admin_staff_performance",
  "admin_staff_detail",
];

async function main() {
  console.log("→ Checking dependencies…");
  await preflight();

  const file = "0047_admin_people_perf_rpcs.sql";
  const sql = fs.readFileSync(path.join(__dirname, "../migrations", file), "utf-8");
  console.log(`→ Applying ${file}…`);
  await client.unsafe(sql);

  const present = await client<{ proname: string }[]>`
    SELECT proname FROM pg_proc WHERE proname = ANY(${EXPECTED_FUNCS})`;
  const names = new Set(present.map((r) => r.proname));
  const missing = EXPECTED_FUNCS.filter((n) => !names.has(n));
  if (missing.length) throw new Error(`Functions failed to create: ${missing.join(", ")}`);
  console.log(`✓ ${EXPECTED_FUNCS.length} function(s) created.`);

  // Live execution as a super_admin (auth.uid() is NULL on a raw connection, so
  // is_admin() would refuse). Impersonate via the JWT-claim GUC in one transaction.
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

    // Pick the customer with the most orders so the orders[] path is exercised.
    const pick = await tx<{ customer_id: number }[]>`
      SELECT customer_id FROM orders
      WHERE customer_id IS NOT NULL
      GROUP BY customer_id ORDER BY count(*) DESC LIMIT 1`;
    if (pick.length === 0) {
      console.log("! No orders found — calling admin_customer_detail on the newest customer.");
    }
    const [cust] = pick.length
      ? pick
      : await tx<{ customer_id: number }[]>`SELECT id AS customer_id FROM customers ORDER BY id DESC LIMIT 1`;

    const [row] = await tx<{ j: any }[]>`SELECT admin_customer_detail(${cust.customer_id}) AS j`;
    const j = row.j;
    console.log("\n── admin_customer_detail(", cust.customer_id, ") ──");
    if (!j) {
      console.log("  returned NULL (customer not found)");
    } else {
      console.log(`  customer   : ${j.customer?.name ?? "?"} (account_type=${j.customer?.account_type ?? "?"})`);
      console.log(`  primary    : ${j.primary ? j.primary.name : "none"}`);
      console.log(`  secondaries: ${(j.secondaries || []).length}`);
      console.log(`  stats      : orders=${j.stats?.orders_count} spend=${j.stats?.total_spend} outstanding=${j.stats?.outstanding_total} last=${j.stats?.last_order_at ?? "none"}`);
      console.log(`  orders     : ${(j.orders || []).length} rows${(j.orders || [])[0] ? `, first=#${j.orders[0].order_number ?? j.orders[0].id} ${j.orders[0].order_type} ${j.orders[0].brand}` : ""}`);
    }

    // Clean 404 on a non-existent id.
    const [nullRow] = await tx<{ j: any }[]>`SELECT admin_customer_detail(-1) AS j`;
    console.log(`  detail(-1) : ${nullRow.j === null ? "NULL ✓ (clean 404)" : "NON-NULL ✗"}`);

    // ── Phase 2: staff performance + staff detail ──────────────────────────
    // Wide window so aggregates are non-empty regardless of imported data age.
    const from = "2000-01-01T00:00:00.000Z";
    const to = "2100-01-01T00:00:00.000Z";

    const [perfRow] = await tx<{ j: any }[]>`SELECT admin_staff_performance(${from}, ${to}, NULL) AS j`;
    const perf = perfRow.j;
    console.log("\n── admin_staff_performance(all-time, all brands) ──");
    console.log(`  stats : staff=${perf?.stats?.staff_count} orders=${perf?.stats?.total_orders} value=${perf?.stats?.total_value} measurements=${perf?.stats?.total_measurements} collections=${perf?.stats?.total_collections}`);
    const top = (perf?.data || [])[0];
    if (top) {
      console.log(`  top   : ${top.name} (${top.role ?? "?"}) orders=${top.orders_taken} value=${top.orders_value} mix=${JSON.stringify(top.order_mix)} measurements=${top.measurements_taken} collections=${top.collections_amount}`);
    }

    // Pick the user who took the most orders, so the detail path is exercised.
    const pickUser = await tx<{ order_taker_id: string }[]>`
      SELECT order_taker_id::text AS order_taker_id FROM orders
      WHERE order_taker_id IS NOT NULL
      GROUP BY order_taker_id ORDER BY count(*) DESC LIMIT 1`;
    if (pickUser.length === 0) {
      console.log("! No orders with an order_taker_id — skipping admin_staff_detail check.");
    } else {
      const uid = pickUser[0].order_taker_id;
      const [detailRow] = await tx<{ j: any }[]>`SELECT admin_staff_detail(${uid}::uuid, ${from}, ${to}) AS j`;
      const d = detailRow.j;
      console.log(`\n── admin_staff_detail(${uid}) ──`);
      if (!d) {
        console.log("  returned NULL (user not found)");
      } else {
        console.log(`  user   : ${d.user?.name ?? "?"} (role=${d.user?.role ?? "?"} dept=${d.user?.department ?? "?"})`);
        console.log(`  totals : orders=${d.totals?.orders_taken} value=${d.totals?.orders_value} mix=${JSON.stringify(d.totals?.order_mix)} measurements=${d.totals?.measurements_taken} collections=${d.totals?.collections_amount} (${d.totals?.collections_count} txns)`);
        console.log(`  daily  : ${(d.daily || []).length} day-buckets`);
        console.log(`  recent : ${(d.recent_orders || []).length} orders${(d.recent_orders || [])[0] ? `, first=#${d.recent_orders[0].id} ${d.recent_orders[0].order_type} ${d.recent_orders[0].brand}` : ""}`);
      }
    }

    // Clean 404 on a non-existent user id.
    const [nullUser] = await tx<{ j: any }[]>`SELECT admin_staff_detail('00000000-0000-0000-0000-000000000000'::uuid, ${from}, ${to}) AS j`;
    console.log(`  detail(zero-uuid) : ${nullUser.j === null ? "NULL ✓ (clean 404)" : "NON-NULL ✗"}`);
  });

  console.log("\n✓ Admin people RPCs applied and verified.");
  await client.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n✗ Apply failed:", err.message || err);
  await client.end().catch(() => {});
  process.exit(1);
});
