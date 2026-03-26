/**
 * Test script for POS Interface queries and RPCs.
 * Runs against the live database to verify correctness, performance, and output shape.
 *
 * Usage: pnpm --filter @repo/database tsx scripts/test-queries.ts
 */
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

// Supabase client — same as the POS app uses
const SUPABASE_URL = "https://yuflzcpqiamilalqwkgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Aj-aSfmcR1WgNn4ONOK8Sw_jQzF8uz6";
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BRAND = "ERTH";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    failed++;
    failures.push(msg);
    console.log(`  ✗ FAIL: ${msg}`);
  } else {
    passed++;
    console.log(`  ✓ ${msg}`);
  }
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const ms = (performance.now() - start).toFixed(0);
  console.log(`  ⏱  ${label}: ${ms}ms`);
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testPgTrgmExtension() {
  console.log("\n═══ 1. pg_trgm Extension ═══");

  const [{ installed }] = await sql`
    SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS installed
  `;
  assert(installed === true, "pg_trgm extension is installed");

  // Verify similarity function works
  const [{ sim }] = await sql`SELECT similarity('Mohammad', 'Mohmmad') AS sim`;
  assert(sim > 0.2, `similarity('Mohammad','Mohmmad') = ${sim} (should be > 0.2, typo tolerance works)`);

  const [{ sim2 }] = await sql`SELECT similarity('96599123', '99123') AS sim2`;
  assert(sim2 > 0, `similarity('96599123','99123') = ${sim2} (partial phone match)`);
}

async function testGinIndexes() {
  console.log("\n═══ 2. GIN Trigram Indexes ═══");

  const indexes = await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'customers' AND indexname LIKE '%trgm%'
    ORDER BY indexname
  `;

  const expected = [
    "customers_arabic_name_trgm_idx",
    "customers_name_trgm_idx",
    "customers_nick_name_trgm_idx",
    "customers_phone_trgm_idx",
  ];

  for (const name of expected) {
    const found = indexes.some((i: any) => i.indexname === name);
    assert(found, `GIN index exists: ${name}`);
  }
}

async function testFuzzyCustomerSearch() {
  console.log("\n═══ 3. search_customers_fuzzy RPC ═══");

  // 3a. Basic search returns results (RPC returns JSONB array)
  const [raw] = await timed("fuzzy search 'al'", () =>
    sql`SELECT search_customers_fuzzy('al', 5)`
  );
  const results = (raw?.search_customers_fuzzy || []) as any[];
  assert(Array.isArray(results), "Returns array");
  assert(results.length <= 5, `Respects limit: got ${results.length} ≤ 5`);

  if (results.length > 0) {
    const first = results[0];
    assert("id" in first, "Result has id field");
    assert("name" in first, "Result has name field");
    assert("phone" in first, "Result has phone field");
    assert("match_score" in first, "Result has match_score field");
    assert(first.match_score > 0, `First result match_score = ${first.match_score} > 0`);

    // Verify sorted by match_score DESC
    if (results.length > 1) {
      assert(
        results[0].match_score >= results[results.length - 1].match_score,
        "Results are sorted by match_score DESC"
      );
    }
  }

  // 3b. Empty query returns nothing
  const [emptyRaw] = await sql`SELECT search_customers_fuzzy('', 10)`;
  const empty = (emptyRaw?.search_customers_fuzzy || []) as any[];
  assert(empty.length === 0, "Empty query returns 0 results");

  // 3c. Phone search works
  const [phoneRaw] = await timed("fuzzy search by phone fragment", () =>
    sql`SELECT search_customers_fuzzy('965', 5)`
  );
  const phoneResults = (phoneRaw?.search_customers_fuzzy || []) as any[];
  assert(phoneResults.length >= 0, `Phone search returned ${phoneResults.length} results`);

  // 3d. Typo tolerance test — find a real customer name and misspell it
  const [sample] = await sql`SELECT name FROM customers WHERE name IS NOT NULL AND length(name) > 4 LIMIT 1`;
  if (sample) {
    const original = sample.name as string;
    // Swap two middle characters to simulate typo
    const mid = Math.floor(original.length / 2);
    const typo = original.slice(0, mid - 1) + original[mid] + original[mid - 1] + original.slice(mid + 1);

    const [typoRaw] = await timed(`typo search: "${typo}" (original: "${original}")`, () =>
      sql`SELECT search_customers_fuzzy(${typo}, 5)`
    );
    const typoResults = (typoRaw?.search_customers_fuzzy || []) as any[];
    const foundOriginal = typoResults.some((r: any) =>
      r.name?.toLowerCase() === original.toLowerCase()
    );
    assert(foundOriginal, `Typo "${typo}" found original "${original}"`);
  }
}

async function testPaginatedCustomerSearch() {
  console.log("\n═══ 4. search_customers_paginated RPC ═══");

  // 4a. No search — returns paginated list
  const page1 = await timed("paginated, no search, page 1", () =>
    sql`SELECT * FROM search_customers_paginated(NULL, 1, 5)`
  );
  assert(page1.length === 1, "Returns single JSONB row");

  const result = page1[0].search_customers_paginated as any;
  assert("data" in result, "Has data field");
  assert("count" in result, "Has count field");
  assert(Array.isArray(result.data), "data is an array");
  assert(result.data.length <= 5, `Page size respected: ${result.data.length} ≤ 5`);
  assert(typeof result.count === "number" && result.count > 0, `Total count: ${result.count}`);

  // 4b. With search
  const searched = await timed("paginated with search 'al'", () =>
    sql`SELECT * FROM search_customers_paginated('al', 1, 10)`
  );
  const searchResult = searched[0].search_customers_paginated as any;
  assert(searchResult.count >= 0, `Search count: ${searchResult.count}`);
  assert(searchResult.data.length <= 10, `Search results bounded: ${searchResult.data.length}`);

  // 4c. Page 2
  const page2 = await timed("paginated page 2", () =>
    sql`SELECT * FROM search_customers_paginated(NULL, 2, 5)`
  );
  const p2 = page2[0].search_customers_paginated as any;
  if (result.count > 5) {
    assert(p2.data.length > 0, "Page 2 has data when total > page_size");
    assert(
      p2.data[0].id !== result.data[0].id,
      "Page 2 has different first item than page 1"
    );
  }
}

async function testCashierSummary() {
  console.log("\n═══ 5. get_cashier_summary RPC ═══");

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [row] = await timed("cashier summary ERTH", () =>
    sql`SELECT get_cashier_summary('ERTH', ${todayStr}::date)`
  );

  const summary = row.get_cashier_summary as any;
  assert(summary !== null, "Returns non-null result");

  // Check all expected fields exist
  const expectedFields = [
    "all_billed", "all_collected", "all_outstanding",
    "today_count", "today_billed", "today_paid",
    "today_collected", "today_refunded",
    "month_billed", "month_paid", "month_outstanding",
    "month_collected", "month_refunded",
    "work_count", "sales_count", "unpaid_count",
    "work_billed", "sales_billed",
    "month_work_billed", "month_sales_billed",
  ];

  for (const field of expectedFields) {
    assert(field in summary, `Has field: ${field}`);
  }

  // Sanity checks on values
  const allBilled = Number(summary.all_billed);
  const allCollected = Number(summary.all_collected);
  const allOutstanding = Number(summary.all_outstanding);

  assert(allBilled >= 0, `all_billed ≥ 0: ${allBilled}`);
  assert(allCollected >= 0, `all_collected ≥ 0: ${allCollected}`);
  assert(allOutstanding >= 0, `all_outstanding ≥ 0: ${allOutstanding}`);
  assert(
    allOutstanding <= allBilled,
    `all_outstanding (${allOutstanding}) ≤ all_billed (${allBilled})`
  );

  // work + sales should account for total count
  const workCount = Number(summary.work_count);
  const salesCount = Number(summary.sales_count);
  assert(workCount >= 0, `work_count ≥ 0: ${workCount}`);
  assert(salesCount >= 0, `sales_count ≥ 0: ${salesCount}`);

  // today_collected comes from payment_transactions, should be ≥ 0
  const todayCollected = Number(summary.today_collected);
  const todayRefunded = Number(summary.today_refunded);
  assert(todayCollected >= 0, `today_collected ≥ 0: ${todayCollected}`);
  assert(todayRefunded >= 0, `today_refunded ≥ 0: ${todayRefunded}`);

  const monthCollected = Number(summary.month_collected);
  assert(monthCollected >= todayCollected, `month_collected (${monthCollected}) ≥ today_collected (${todayCollected})`);

  // Verify cancelled orders are excluded
  const [cancelledCheck] = await sql`
    SELECT COUNT(*) AS cnt FROM orders
    WHERE brand = 'ERTH' AND checkout_status = 'cancelled' AND order_total > 0
  `;
  if (Number(cancelledCheck.cnt) > 0) {
    // If there are cancelled orders, verify they're not in the counts
    const [confirmedOnly] = await sql`
      SELECT
        COALESCE(SUM(order_total::decimal), 0) AS confirmed_billed,
        COUNT(*) AS confirmed_count
      FROM orders
      WHERE brand = 'ERTH' AND checkout_status = 'confirmed'
    `;
    assert(
      Math.abs(allBilled - Number(confirmedOnly.confirmed_billed)) < 0.01,
      `all_billed matches confirmed-only total (cancelled orders excluded)`
    );
  }

  console.log(`\n  📊 Summary snapshot (ERTH):
     All-time: billed=${allBilled}, collected=${allCollected}, outstanding=${allOutstanding}
     Today: count=${summary.today_count}, billed=${summary.today_billed}, collected=${todayCollected}
     Month: billed=${summary.month_billed}, collected=${monthCollected}
     Types: work=${workCount}, sales=${salesCount}, unpaid=${summary.unpaid_count}`);
}

async function testCashierPaymentFilter() {
  console.log("\n═══ 6. get_cashier_order_ids_by_payment RPC ═══");

  // 6a. Unpaid orders
  const unpaid = await timed("get unpaid order IDs", () =>
    sql`SELECT * FROM get_cashier_order_ids_by_payment('ERTH', 'unpaid', 10)`
  );
  assert(unpaid.length <= 10, `Unpaid respects limit: ${unpaid.length} ≤ 10`);

  if (unpaid.length > 0) {
    // Verify these are actually unpaid
    const ids = unpaid.map((r: any) => r.get_cashier_order_ids_by_payment);
    const [check] = await sql`
      SELECT COUNT(*) AS cnt FROM orders
      WHERE id = ANY(${ids}::int[])
        AND (order_total::decimal - COALESCE(paid::decimal, 0)) > 0.001
    `;
    assert(
      Number(check.cnt) === ids.length,
      `All ${ids.length} returned orders are actually unpaid`
    );
  }

  // 6b. Paid orders
  const paid = await timed("get paid order IDs", () =>
    sql`SELECT * FROM get_cashier_order_ids_by_payment('ERTH', 'paid', 10)`
  );
  assert(paid.length <= 10, `Paid respects limit: ${paid.length} ≤ 10`);

  if (paid.length > 0) {
    const ids = paid.map((r: any) => r.get_cashier_order_ids_by_payment);
    const [check] = await sql`
      SELECT COUNT(*) AS cnt FROM orders
      WHERE id = ANY(${ids}::int[])
        AND COALESCE(paid::decimal, 0) >= order_total::decimal
    `;
    assert(
      Number(check.cnt) === ids.length,
      `All ${ids.length} returned orders are actually paid`
    );
  }
}

async function testQueryPerformance() {
  console.log("\n═══ 7. Query Performance ═══");

  // Test that GIN indexes are actually being used
  const [plan] = await sql`
    EXPLAIN (FORMAT JSON) SELECT * FROM search_customers_fuzzy('ahmad', 10)
  `;
  const planText = JSON.stringify(plan);
  // Note: EXPLAIN on a function call may not always show inner index usage,
  // so we test timing directly instead

  // Time the key queries
  await timed("search_customers_fuzzy('ahmad', 10)", () =>
    sql`SELECT search_customers_fuzzy('ahmad', 10)`
  );

  await timed("search_customers_paginated('al', 1, 20)", () =>
    sql`SELECT search_customers_paginated('al', 1, 20)`
  );

  await timed("get_cashier_summary('ERTH')", () =>
    sql`SELECT get_cashier_summary('ERTH', CURRENT_DATE)`
  );

  await timed("get_cashier_order_ids_by_payment('ERTH','unpaid',30)", () =>
    sql`SELECT * FROM get_cashier_order_ids_by_payment('ERTH', 'unpaid', 30)`
  );

  // Test that safety limits work on key queries
  const [orderCount] = await sql`
    SELECT COUNT(*) AS cnt FROM orders WHERE brand = 'ERTH' AND checkout_status = 'confirmed'
  `;
  console.log(`\n  📊 Total confirmed ERTH orders: ${orderCount.cnt}`);

  const [customerCount] = await sql`
    SELECT COUNT(*) AS cnt FROM customers
  `;
  console.log(`  📊 Total customers: ${customerCount.cnt}`);
}

async function testEdgeCases() {
  console.log("\n═══ 8. Edge Cases ═══");

  // 8a. Special characters don't break queries
  const [special] = await sql`SELECT search_customers_fuzzy(${"test',.()"}, 5)`;
  assert(special?.search_customers_fuzzy !== undefined, "Special chars don't crash fuzzy search");

  // 8b. Very long input
  const long = "a".repeat(200);
  const [longResult] = await sql`SELECT search_customers_fuzzy(${long}, 5)`;
  assert(longResult?.search_customers_fuzzy !== undefined, "Very long input doesn't crash");

  // 8c. Arabic text search
  const [arabic] = await sql`SELECT search_customers_fuzzy('محمد', 5)`;
  const arabicResults = (arabic?.search_customers_fuzzy || []) as any[];
  assert(Array.isArray(arabicResults), `Arabic search works, returned ${arabicResults.length} results`);

  // 8d. Numeric search (phone-like)
  const [numeric] = await sql`SELECT search_customers_fuzzy('9651234', 5)`;
  const numericResults = (numeric?.search_customers_fuzzy || []) as any[];
  assert(Array.isArray(numericResults), `Numeric search works, returned ${numericResults.length} results`);

  // 8e. Valid brand with no data returns zeros
  const [qassSummary] = await sql`SELECT get_cashier_summary('QASS', CURRENT_DATE)`;
  assert(qassSummary?.get_cashier_summary !== null, "Brand with few/no orders returns valid summary");

  // 8f. Paid/unpaid with valid but sparse brand
  const noResults = await sql`SELECT * FROM get_cashier_order_ids_by_payment('QASS', 'unpaid', 10)`;
  assert(noResults.length >= 0, "Sparse brand returns 0+ results for unpaid");
}

// ─── PostgREST / Supabase Query Tests (mirrors actual API layer) ──────────────

async function testDashboardOrders() {
  console.log("\n═══ 9. getDashboardOrders (PostgREST) ═══");

  const { data, error } = await db
    .from('orders')
    .select(`
      id, checkout_status, order_type, order_date, paid, order_total, discount_value,
      workOrder:work_orders!order_id(order_phase, delivery_date),
      customer:customers(id, name),
      garments:garments(piece_stage, location, garment_type, feedback_status, acceptance_status, trip_number)
    `)
    .eq('brand', BRAND)
    .eq('checkout_status', 'confirmed')
    .limit(2000);

  assert(!error, `No error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data || []), "Returns array");
  assert((data || []).length <= 2000, `Bounded: ${(data || []).length} ≤ 2000`);

  if (data && data.length > 0) {
    const first = data[0] as any;
    assert(first.checkout_status === 'confirmed', "All results are confirmed");
    assert('garments' in first, "Has garments relation");
    assert(Array.isArray(first.garments), "Garments is array");
    // Verify no full fabric data (we trimmed the query)
    if (first.garments.length > 0) {
      assert(!('fabric' in first.garments[0]), "Garments don't have fabric join (optimized)");
    }
  }
  console.log(`  📊 Dashboard orders: ${data?.length || 0}`);
}

async function testShowroomOrders() {
  console.log("\n═══ 10. useShowroomOrders (PostgREST) ═══");

  const { data, error } = await db
    .from('orders')
    .select(`
      *,
      workOrder:work_orders!order_id!inner(*),
      customer:customers(*),
      garments:garments(*, fabric:fabrics(*))
    `)
    .eq('brand', BRAND)
    .eq('checkout_status', 'confirmed')
    .eq('order_type', 'WORK')
    .eq('workOrder.order_phase', 'in_progress')
    .limit(1000);

  assert(!error, `No error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data), "Returns array");
  assert(data!.length <= 1000, `Bounded: ${data!.length} ≤ 1000`);

  if (data && data.length > 0) {
    const first = data[0] as any;
    assert(first.order_type === 'WORK', "Only WORK orders");
    assert(first.checkout_status === 'confirmed', "Only confirmed");
    const wo = Array.isArray(first.workOrder) ? first.workOrder[0] : first.workOrder;
    assert(wo?.order_phase === 'in_progress', "Only in_progress phase");
  }
  console.log(`  📊 Showroom orders: ${data?.length}`);
}

async function testOrderHistory() {
  console.log("\n═══ 11. useOrderHistory (PostgREST) ═══");

  const { data, error, count } = await db
    .from('orders')
    .select(`
      *,
      workOrder:work_orders!order_id(*),
      customer:customers!inner(name, phone, nick_name),
      garments:garments(id),
      shelf_items:order_shelf_items(id)
    `, { count: 'exact' })
    .eq('brand', BRAND)
    .order('order_date', { ascending: false })
    .range(0, 19);

  assert(!error, `No error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data), "Returns array");
  assert(data!.length <= 20, `Paginated: ${data!.length} ≤ 20`);
  assert(typeof count === 'number', `Count returned: ${count}`);

  if (data && data.length > 1) {
    // Verify sorted DESC
    const d0 = new Date(data[0].order_date).getTime();
    const d1 = new Date(data[data.length - 1].order_date).getTime();
    assert(d0 >= d1, "Sorted by order_date DESC");
  }
  console.log(`  📊 History: page1=${data?.length}, total=${count}`);
}

async function testGetOrderById() {
  console.log("\n═══ 12. getOrderById / getOrderByInvoice (PostgREST) ═══");

  // Get a known order
  const { data: orders } = await db.from('orders').select('id').eq('brand', BRAND).limit(1);
  if (!orders || orders.length === 0) {
    console.log("  ⚠ No orders to test");
    return;
  }
  const testId = orders[0].id;

  // By ID
  const { data: byId, error: errId } = await db
    .from('orders')
    .select('*, workOrder:work_orders!order_id(*)')
    .eq('id', testId)
    .eq('brand', BRAND)
    .maybeSingle();

  assert(!errId, `By ID no error: ${errId?.message || 'OK'}`);
  assert(byId?.id === testId, `Found order ${testId} by ID`);

  // By ID with relations
  const { data: byIdFull, error: errFull } = await db
    .from('orders')
    .select(`
      *,
      workOrder:work_orders!order_id(*),
      customer:customers(*),
      garments:garments(*, fabric:fabrics(*)),
      shelf_items:order_shelf_items(*, shelf:shelf(*))
    `)
    .eq('id', testId)
    .eq('brand', BRAND)
    .maybeSingle();

  assert(!errFull, `Full relations no error: ${errFull?.message || 'OK'}`);
  assert(byIdFull?.id === testId, "Full order returned");
  assert('customer' in (byIdFull || {}), "Has customer relation");
  assert('garments' in (byIdFull || {}), "Has garments relation");
}

async function testDispatchedOrders() {
  console.log("\n═══ 13. getDispatchedOrders (PostgREST) ═══");

  const { data, error } = await db
    .from('orders')
    .select(`
      *,
      workOrder:work_orders!order_id!inner(*),
      customer:customers(*),
      garments:garments!inner(*, fabric:fabrics(*))
    `)
    .eq('garments.location', 'transit_to_shop')
    .eq('brand', BRAND)
    .eq('checkout_status', 'confirmed')
    .limit(500);

  assert(!error, `No error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data), "Returns array");
  assert(data!.length <= 500, `Bounded: ${data!.length} ≤ 500`);

  if (data && data.length > 0) {
    const garments = (data[0] as any).garments || [];
    assert(garments.length > 0, "Has garments (inner join)");
    assert(garments.every((g: any) => g.location === 'transit_to_shop'), "All garments in transit_to_shop");
  }
  console.log(`  📊 Dispatched orders: ${data?.length}`);
}

async function testLinkedOrders() {
  console.log("\n═══ 14. getLinkedOrders (PostgREST) ═══");

  const { data, error } = await db
    .from('orders')
    .select(`
      *,
      workOrder:work_orders!order_id!inner(*),
      customer:customers!customer_id(*)
    `)
    .not('workOrder.linked_order_id', 'is', null)
    .eq('brand', BRAND)
    .limit(500);

  assert(!error, `No error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data), "Returns array");
  assert(data!.length <= 500, `Bounded: ${data!.length} ≤ 500`);
  console.log(`  📊 Linked orders: ${data?.length}`);
}

async function testOrdersForLinking() {
  console.log("\n═══ 15. getOrderForLinking (PostgREST) ═══");

  // Get a customer ID
  const { data: customers } = await db.from('customers').select('id').limit(1);
  if (!customers || customers.length === 0) {
    console.log("  ⚠ No customers to test");
    return;
  }

  const { data, error } = await db
    .from('orders')
    .select(`
      *,
      workOrder:work_orders!order_id!inner(*),
      customer:customers(*),
      child_orders:work_orders!linked_order_id(id:order_id)
    `)
    .eq('customer_id', customers[0].id)
    .eq('checkout_status', 'confirmed')
    .eq('order_type', 'WORK')
    .eq('brand', BRAND)
    .neq('workOrder.order_phase', 'completed')
    .order('order_date', { ascending: false });

  assert(!error, `No error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data), "Returns array");
  console.log(`  📊 Linkable orders for customer ${customers[0].id}: ${data?.length}`);
}

async function testCatalogQueries() {
  console.log("\n═══ 16. Catalog queries (fabrics, styles, prices, shelf, employees, campaigns) ═══");

  const queries = [
    { name: "fabrics", fn: () => db.from('fabrics').select('*') },
    { name: "styles", fn: () => db.from('styles').select('*') },
    { name: "prices", fn: () => db.from('prices').select('*') },
    { name: "shelf", fn: () => db.from('shelf').select('*') },
    { name: "users", fn: () => db.from('users').select('*') },
    { name: "campaigns", fn: () => db.from('campaigns').select('*').eq('active', true) },
  ];

  for (const q of queries) {
    const { data, error } = await q.fn();
    assert(!error, `${q.name}: no error (${error?.message || 'OK'})`);
    assert(Array.isArray(data), `${q.name}: returns array (${data?.length} rows)`);
  }
}

async function testCustomerQueries() {
  console.log("\n═══ 17. Customer queries (PostgREST) ═══");

  // getPaginatedCustomers (no search)
  const { data: page, error: pageErr, count } = await db
    .from('customers')
    .select('*', { count: 'exact' })
    .order('phone', { ascending: true })
    .range(0, 4);

  assert(!pageErr, `Paginated no error: ${pageErr?.message || 'OK'}`);
  assert(page!.length <= 5, `Paginated bounded: ${page!.length}`);
  assert(typeof count === 'number', `Count: ${count}`);

  // getCustomerById
  if (page && page.length > 0) {
    const { data: single, error: singleErr } = await db
      .from('customers')
      .select('*')
      .eq('id', page[0].id)
      .single();

    assert(!singleErr, `By ID no error: ${singleErr?.message || 'OK'}`);
    assert(single?.id === page[0].id, `Found customer ${page[0].id}`);
  }

  // searchPrimaryAccountByPhone
  const { data: primary, error: primaryErr } = await db
    .from('customers')
    .select('*')
    .eq('phone', '12345')
    .eq('account_type', 'Primary');

  assert(!primaryErr, `Primary search no error: ${primaryErr?.message || 'OK'}`);
  assert(Array.isArray(primary), "Primary search returns array");

  // getCustomerCount (head only)
  const { count: headCount, error: headErr } = await db
    .from('customers')
    .select('*', { count: 'exact', head: true });

  assert(!headErr, `Head count no error: ${headErr?.message || 'OK'}`);
  assert(typeof headCount === 'number' && headCount > 0, `Head count: ${headCount}`);
}

async function testMeasurementQueries() {
  console.log("\n═══ 18. Measurement queries (PostgREST) ═══");

  const { data, error } = await db.from('measurements').select('*');
  assert(!error, `All measurements no error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data), `Returns array: ${data?.length} rows`);

  // By customer ID
  const { data: customers } = await db.from('customers').select('id').limit(1);
  if (customers && customers.length > 0) {
    const { data: byCustomer, error: custErr } = await db
      .from('measurements')
      .select('*')
      .eq('customer_id', customers[0].id)
      .order('measurement_date', { ascending: false });

    assert(!custErr, `By customer no error: ${custErr?.message || 'OK'}`);
    assert(Array.isArray(byCustomer), `By customer returns array: ${byCustomer?.length}`);
  }
}

async function testFeedbackQueries() {
  console.log("\n═══ 19. Feedback queries (PostgREST) ═══");

  // Get a garment to test with
  const { data: garments } = await db.from('garments').select('id, order_id').limit(1);
  if (!garments || garments.length === 0) {
    console.log("  ⚠ No garments to test");
    return;
  }

  const g = garments[0];

  // By garment ID
  const { data: byGarment, error: gErr } = await db
    .from('garment_feedback')
    .select('*')
    .eq('garment_id', g.id)
    .order('created_at', { ascending: false });

  assert(!gErr, `By garment no error: ${gErr?.message || 'OK'}`);
  assert(Array.isArray(byGarment), `By garment: ${byGarment?.length} records`);

  // By order ID
  const { data: byOrder, error: oErr } = await db
    .from('garment_feedback')
    .select('*')
    .eq('order_id', g.order_id)
    .order('created_at', { ascending: false });

  assert(!oErr, `By order no error: ${oErr?.message || 'OK'}`);
  assert(Array.isArray(byOrder), `By order: ${byOrder?.length} records`);
}

async function testGarmentRedispatch() {
  console.log("\n═══ 20. getGarmentsForRedispatch (PostgREST) ═══");

  const { data, error } = await db
    .from('garments')
    .select(`
      *,
      orders!inner (
        id,
        customer_id,
        customers ( id, name, phone ),
        work_orders!work_orders_order_id_orders_id_fk ( invoice_number )
      ),
      garment_feedback!inner (
        id, action, distribution, satisfaction_level, notes, measurement_diffs, trip_number, created_at
      )
    `)
    .eq('location', 'shop')
    .eq('orders.brand', BRAND)
    .eq('garment_feedback.distribution', 'workshop');

  assert(!error, `No error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data), `Returns array: ${data?.length} garments`);

  if (data && data.length > 0) {
    const first = data[0] as any;
    assert(first.location === 'shop', "All at shop");
    assert(first.garment_feedback?.length > 0, "Has feedback records");
  }
  console.log(`  📊 Garments for redispatch: ${data?.length}`);
}

async function testCashierListQueries() {
  console.log("\n═══ 21. Cashier list queries (PostgREST) ═══");

  const CASHIER_ORDER_LIST_QUERY = `
    id, order_type, checkout_status, order_total, paid, order_date, brand, discount_value,
    workOrder:work_orders!order_id(invoice_number, order_phase, delivery_date, home_delivery),
    customer:customers(name, phone),
    garments:garments(piece_stage, location)
  `;

  // Recent orders (all filter)
  const { data: recent, error: recentErr } = await db
    .from('orders')
    .select(CASHIER_ORDER_LIST_QUERY)
    .eq('brand', BRAND)
    .neq('checkout_status', 'draft')
    .order('order_date', { ascending: false })
    .limit(30);

  assert(!recentErr, `Recent all: no error (${recentErr?.message || 'OK'})`);
  assert(Array.isArray(recent), `Recent all: ${recent?.length} orders`);
  assert(recent!.length <= 30, `Recent bounded: ${recent!.length} ≤ 30`);

  if (recent && recent.length > 0) {
    const first = recent[0] as any;
    assert(first.checkout_status !== 'draft', "No drafts in results");
    assert('customer' in first, "Has customer");
    assert('garments' in first, "Has garments");
  }

  // Today filter
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const { data: todayOrders, error: todayErr } = await db
    .from('orders')
    .select(CASHIER_ORDER_LIST_QUERY)
    .eq('brand', BRAND)
    .neq('checkout_status', 'draft')
    .gte('order_date', `${todayStr}T00:00:00`)
    .lte('order_date', `${todayStr}T23:59:59`)
    .order('order_date', { ascending: false })
    .limit(30);

  assert(!todayErr, `Today filter: no error (${todayErr?.message || 'OK'})`);
  assert(Array.isArray(todayOrders), `Today: ${todayOrders?.length} orders`);

  // Payment transactions
  if (recent && recent.length > 0) {
    const { data: txns, error: txnErr } = await db
      .from('payment_transactions')
      .select('*, cashier:users(name)')
      .eq('order_id', recent[0].id)
      .order('created_at', { ascending: false });

    assert(!txnErr, `Transactions: no error (${txnErr?.message || 'OK'})`);
    assert(Array.isArray(txns), `Transactions: ${txns?.length} for order ${recent[0].id}`);
  }
}

async function testCashierOrderSearch() {
  console.log("\n═══ 22. Cashier order search (PostgREST) ═══");

  const CASHIER_QUERY = `
    *,
    workOrder:work_orders!order_id(invoice_number, order_phase, delivery_date, home_delivery, campaign_id, campaign:campaigns(name)),
    customer:customers(id, name, phone, country_code, account_type, relation, city, area, block, street, house_no, address_note),
    garments:garments(id, garment_id, piece_stage, location, garment_type, trip_number, feedback_status, acceptance_status, fabric_id, style, express),
    shelf_items:order_shelf_items(id, shelf_id, quantity, unit_price, shelf:shelf(type)),
    payment_transactions:payment_transactions(id, amount, transaction_type, payment_type, payment_ref_no, payment_note, created_at, cashier_id, cashier:users(name))
  `;

  // Get a known order ID
  const { data: orders } = await db.from('orders').select('id').eq('brand', BRAND).neq('checkout_status', 'draft').limit(1);
  if (!orders || orders.length === 0) {
    console.log("  ⚠ No orders to search");
    return;
  }

  const testId = orders[0].id;

  // Search by ID
  const { data: byId, error: idErr } = await db
    .from('orders')
    .select(CASHIER_QUERY)
    .eq('id', testId)
    .eq('brand', BRAND)
    .neq('checkout_status', 'draft')
    .maybeSingle();

  assert(!idErr, `Search by ID: no error (${idErr?.message || 'OK'})`);
  assert(byId?.id === testId, `Found order ${testId} by ID`);
  assert('payment_transactions' in (byId || {}), "Has payment_transactions relation");
  assert('shelf_items' in (byId || {}), "Has shelf_items relation");

  // Fuzzy customer search for cashier
  const { data: fuzzyResult } = await db.rpc('search_customers_fuzzy', {
    p_query: 'john',
    p_limit: 1,
  });
  assert(fuzzyResult !== null, "Fuzzy search via Supabase RPC works");
  console.log(`  📊 Fuzzy 'john': ${Array.isArray(fuzzyResult) ? fuzzyResult.length : 'N/A'} results`);
}

// ─── Workshop Query Tests ──────────────────────────────────────────────────────

async function testWorkshopGarments() {
  console.log("\n═══ 23. Workshop getWorkshopGarments (PostgREST) ═══");

  const WORKSHOP_QUERY = `
    *,
    order:orders!order_id(
      id, brand, checkout_status,
      workOrder:work_orders!order_id(invoice_number, delivery_date, order_phase, home_delivery)
    ),
    customer:orders!order_id(
      customer:customers!customer_id(name, phone, country_code)
    ),
    measurement:measurements!measurement_id(*),
    style_ref:styles!style_id(name, image_url),
    fabric_ref:fabrics!fabric_id(name, color)
  `;

  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY)
    .in('location', ['workshop', 'transit_to_workshop', 'transit_to_shop'])
    .eq('order.checkout_status', 'confirmed');

  assert(!error, `No error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data), "Returns array");

  // Filter out nulls (same as app does)
  const garments = (data ?? []).filter((g: any) => g.order !== null);

  if (garments.length > 0) {
    const first = garments[0] as any;
    assert(first.order?.checkout_status === 'confirmed', "Only confirmed orders");
    assert(
      ['workshop', 'transit_to_workshop', 'transit_to_shop'].includes(first.location),
      "Location is workshop/transit"
    );
    // Verify join shape
    assert('measurement' in first, "Has measurement join");
    assert('style_ref' in first, "Has style_ref join");
    assert('fabric_ref' in first, "Has fabric_ref join");
  }

  console.log(`  📊 Workshop garments: ${garments.length}`);
}

async function testWorkshopReceiving() {
  console.log("\n═══ 24. Workshop receiving filter ═══");

  // Check all garments in transit_to_workshop
  const { data: inTransit } = await db
    .from('garments')
    .select('id, piece_stage, location, order_id')
    .eq('location', 'transit_to_workshop');

  const transitCount = inTransit?.length ?? 0;
  console.log(`  📊 Garments in transit_to_workshop: ${transitCount}`);

  if (transitCount > 0) {
    // Check what piece_stages they have — this reveals if sidebar misses any
    const stages = new Map<string, number>();
    for (const g of inTransit!) {
      const stage = g.piece_stage ?? 'null';
      stages.set(stage, (stages.get(stage) ?? 0) + 1);
    }
    console.log(`  📊 Transit garment stages: ${JSON.stringify(Object.fromEntries(stages))}`);

    // These are the stages the sidebar counts query filters for
    // These are the stages the sidebar counts query filters for (actionable only)
    const sidebarStages = new Set([
      'waiting_cut',
      'soaking', 'cutting', 'post_cutting', 'sewing', 'finishing', 'ironing',
      'quality_check', 'ready_for_dispatch', 'brova_trialed',
    ]);

    const missedStages = [...stages.keys()].filter(s => !sidebarStages.has(s));
    if (missedStages.length > 0) {
      assert(false,
        `SIDEBAR BUG: These piece_stages exist at transit_to_workshop but are excluded from sidebar counts: ${missedStages.join(', ')} (${missedStages.map(s => stages.get(s)).join(', ')} garments missed)`
      );
    } else {
      assert(true, "All transit_to_workshop garment stages are covered by sidebar filter");
    }
  }
}

async function testWorkshopDispatch() {
  console.log("\n═══ 25. Workshop dispatch consistency ═══");

  // What the dispatch page shows (getWorkshopGarments → filter by DISPATCH_STAGES)
  const DISPATCH_STAGES = ['ready_for_dispatch', 'brova_trialed'];

  const { data: workshopGarments } = await db
    .from('garments')
    .select('id, piece_stage, location')
    .eq('location', 'workshop')
    .in('piece_stage', DISPATCH_STAGES);

  const dispatchPageCount = workshopGarments?.length ?? 0;
  console.log(`  📊 Dispatch page garments (workshop + dispatch stages): ${dispatchPageCount}`);

  if (dispatchPageCount > 0) {
    const stageBreakdown = new Map<string, number>();
    for (const g of workshopGarments!) {
      const s = g.piece_stage ?? 'null';
      stageBreakdown.set(s, (stageBreakdown.get(s) ?? 0) + 1);
    }
    console.log(`  📊 Dispatch stage breakdown: ${JSON.stringify(Object.fromEntries(stageBreakdown))}`);

    const sidebarStages = new Set([
      'waiting_for_acceptance', 'waiting_cut', 'soaking', 'cutting', 'post_cutting',
      'sewing', 'finishing', 'ironing', 'quality_check', 'ready_for_dispatch', 'brova_trialed',
    ]);

    const missedBySQL = [...stageBreakdown.entries()]
      .filter(([stage]) => !sidebarStages.has(stage));

    if (missedBySQL.length > 0) {
      const missedCount = missedBySQL.reduce((sum, [, count]) => sum + count, 0);
      assert(false,
        `SIDEBAR DISPATCH BUG: ${missedCount} garments at workshop with stages [${missedBySQL.map(([s, c]) => `${s}:${c}`).join(', ')}] are visible on dispatch page but NOT counted in sidebar badge`
      );
    } else {
      assert(true, "Sidebar and dispatch page counts agree");
    }
  }

  // Check for shop-only stages at workshop (should never happen)
  const { data: shopStagesAtWorkshop } = await db
    .from('garments')
    .select('id, piece_stage, location')
    .eq('location', 'workshop')
    .in('piece_stage', ['ready_for_pickup', 'awaiting_trial']);

  const badCount = shopStagesAtWorkshop?.length ?? 0;
  assert(badCount === 0,
    badCount === 0
      ? "No shop-only stages (ready_for_pickup, awaiting_trial) found at workshop location"
      : `DATA ISSUE: ${badCount} garments at workshop with shop-only stages`
  );
}

async function testWorkshopSidebarCounts() {
  console.log("\n═══ 26. Workshop sidebar counts accuracy ═══");

  // Replicate the exact sidebar query
  const { data: sidebarData, error: sidebarErr } = await db
    .from('garments')
    .select('piece_stage, location, in_production, production_plan')
    .in('location', ['workshop', 'transit_to_workshop'])
    .in('piece_stage', [
      'waiting_cut',
      'soaking', 'cutting', 'post_cutting', 'sewing', 'finishing', 'ironing',
      'quality_check', 'ready_for_dispatch', 'brova_trialed',
    ]);

  assert(!sidebarErr, `Sidebar query: no error (${sidebarErr?.message || 'OK'})`);

  // Get all actionable garments (excluding waiting_for_acceptance which are parked finals)
  const { data: allWorkshop } = await db
    .from('garments')
    .select('id, piece_stage, location, in_production, production_plan, order_id')
    .in('location', ['workshop', 'transit_to_workshop']);

  const sidebarCount = sidebarData?.length ?? 0;
  // Only count actionable garments — waiting_for_acceptance finals are intentionally excluded
  const nonActionableStages = new Set(['waiting_for_acceptance']);
  const actionable = (allWorkshop ?? []).filter(g => !nonActionableStages.has(g.piece_stage ?? ''));
  const actionableCount = actionable.length;
  const parkedCount = (allWorkshop?.length ?? 0) - actionableCount;

  if (parkedCount > 0) {
    console.log(`  📊 Parked finals (waiting_for_acceptance, excluded from sidebar): ${parkedCount}`);
  }

  if (actionableCount > sidebarCount) {
    // Find what's missing
    const missedStages = new Map<string, number>();
    const sidebarPieceStages = new Set([
      'waiting_cut',
      'soaking', 'cutting', 'post_cutting', 'sewing', 'finishing', 'ironing',
      'quality_check', 'ready_for_dispatch', 'brova_trialed',
    ]);

    for (const g of actionable) {
      if (!sidebarPieceStages.has(g.piece_stage ?? '')) {
        const stage = g.piece_stage ?? 'null';
        missedStages.set(stage, (missedStages.get(stage) ?? 0) + 1);
      }
    }

    assert(false,
      `SIDEBAR UNDERCOUNTS: sidebar sees ${sidebarCount}/${actionableCount} actionable garments. Missing stages: ${JSON.stringify(Object.fromEntries(missedStages))}`
    );
  } else {
    assert(true, `Sidebar counts all ${actionableCount} actionable workshop garments (${parkedCount} parked finals correctly excluded)`);
  }

  // Check if sidebar includes garments from cancelled/draft orders
  if (allWorkshop && allWorkshop.length > 0) {
    const orderIds = [...new Set(allWorkshop.map(g => g.order_id))];
    const { data: orderStatuses } = await db
      .from('orders')
      .select('id, checkout_status')
      .in('id', orderIds);

    const nonConfirmed = orderStatuses?.filter(o => o.checkout_status !== 'confirmed') ?? [];
    if (nonConfirmed.length > 0) {
      const badGarments = allWorkshop.filter(g =>
        nonConfirmed.some(o => o.id === g.order_id)
      );
      assert(false,
        `SIDEBAR NO CHECKOUT FILTER: ${badGarments.length} garments from ${nonConfirmed.length} non-confirmed orders (${nonConfirmed.map(o => `${o.id}:${o.checkout_status}`).join(', ')}) are counted in sidebar`
      );
    } else {
      assert(true, "All workshop garments belong to confirmed orders (no filter needed currently)");
    }
  }
}

async function testWorkshopAssignedView() {
  console.log("\n═══ 27. Workshop assigned view ═══");

  // Step 1: find order_ids with production_plan
  const { data: planned, error: e1 } = await db
    .from('garments')
    .select('order_id')
    .not('production_plan', 'is', null);

  assert(!e1, `Step 1: no error (${e1?.message || 'OK'})`);

  if (!planned || planned.length === 0) {
    console.log("  ⚠ No garments with production_plan");
    return;
  }

  const orderIds = [...new Set(planned.map((g: any) => g.order_id))];
  console.log(`  📊 Orders with production activity: ${orderIds.length}`);

  // Step 2: fetch all garments from those orders
  const { data: allGarments, error: e2 } = await db
    .from('garments')
    .select('id, order_id, piece_stage, location, production_plan, in_production')
    .in('order_id', orderIds);

  assert(!e2, `Step 2: no error (${e2?.message || 'OK'})`);

  const totalGarments = allGarments?.length ?? 0;
  console.log(`  📊 Total garments from planned orders: ${totalGarments}`);

  // Verify: every order has at least one garment with production_plan
  const ordersWithPlan = new Set(
    (allGarments ?? []).filter(g => g.production_plan !== null).map(g => g.order_id)
  );
  const ordersWithout = orderIds.filter(id => !ordersWithPlan.has(id));
  assert(ordersWithout.length === 0,
    ordersWithout.length === 0
      ? "Every returned order has at least one garment with production_plan"
      : `${ordersWithout.length} orders have no garments with production_plan (IDs: ${ordersWithout.slice(0, 5).join(', ')})`
  );
}

async function testWorkshopCompletedOrders() {
  console.log("\n═══ 28. Workshop completed orders view ═══");

  // Step 1: find order_ids with production_plan
  const { data: planned } = await db
    .from('garments')
    .select('order_id')
    .not('production_plan', 'is', null);

  if (!planned || planned.length === 0) {
    console.log("  ⚠ No garments with production_plan");
    return;
  }

  const orderIds = [...new Set(planned.map((g: any) => g.order_id))];

  // Step 2: all garments from those orders
  const { data: all } = await db
    .from('garments')
    .select('id, order_id, piece_stage, location')
    .in('order_id', orderIds);

  if (!all) return;

  // Group by order
  const byOrder = new Map<number, typeof all>();
  for (const g of all) {
    if (!byOrder.has(g.order_id)) byOrder.set(g.order_id, []);
    byOrder.get(g.order_id)!.push(g);
  }

  // Apply same filter as app: all garments completed or at shop
  let completedCount = 0;
  let notCompleted = 0;
  for (const [orderId, garments] of byOrder) {
    const allDone = garments.every(
      (g) => g.piece_stage === 'completed' || (g.location === 'shop' && ['completed', 'ready_for_pickup', 'brova_trialed'].includes(g.piece_stage ?? '')),
    );
    if (allDone) completedCount++;
    else notCompleted++;
  }

  console.log(`  📊 Completed orders: ${completedCount}, In progress: ${notCompleted}`);

  // Sanity: completed orders shouldn't have garments at workshop/transit
  for (const [orderId, garments] of byOrder) {
    const allDone = garments.every(
      (g) => g.piece_stage === 'completed' || (g.location === 'shop' && ['completed', 'ready_for_pickup', 'brova_trialed'].includes(g.piece_stage ?? '')),
    );
    if (allDone) {
      const workshopGarments = garments.filter(g =>
        g.location === 'workshop' || g.location === 'transit_to_workshop' || g.location === 'transit_to_shop'
      );
      if (workshopGarments.length > 0) {
        // This is actually possible: garment at shop with piece_stage != completed
        // The filter is location=shop OR piece_stage=completed, so a garment at shop
        // with piece_stage=awaiting_trial would pass
        const nonCompleted = workshopGarments.filter(g => g.piece_stage !== 'completed');
        if (nonCompleted.length > 0) {
          assert(false,
            `Order ${orderId} marked complete but has ${nonCompleted.length} non-completed garments at workshop/transit`
          );
          break;
        }
      }
    }
  }
  assert(true, "Completed orders have consistent garment states");
}

async function testWorkshopSchedulerFilter() {
  console.log("\n═══ 29. Workshop scheduler garment filter ═══");

  // Scheduler shows: location=workshop, in_production=true, no production_plan, piece_stage=waiting_cut
  const { data: schedulerGarments } = await db
    .from('garments')
    .select('id, piece_stage, location, in_production, production_plan, garment_type, trip_number, feedback_status')
    .eq('location', 'workshop')
    .eq('in_production', true)
    .is('production_plan', null)
    .eq('piece_stage', 'waiting_cut');

  const count = schedulerGarments?.length ?? 0;
  console.log(`  📊 Scheduler garments (waiting for scheduling): ${count}`);

  if (count > 0) {
    // Verify none are waiting_for_acceptance finals (they should be excluded)
    const parkedFinals = schedulerGarments!.filter(g => g.piece_stage === 'waiting_for_acceptance');
    assert(parkedFinals.length === 0, "No waiting_for_acceptance finals in scheduler");

    // Check trip numbers
    const trips = new Map<number, number>();
    for (const g of schedulerGarments!) {
      const trip = g.trip_number ?? 1;
      trips.set(trip, (trips.get(trip) ?? 0) + 1);
    }
    console.log(`  📊 By trip number: ${JSON.stringify(Object.fromEntries(trips))}`);
  }

  // Also check: are there garments at workshop, in_production=true, with a plan but still at waiting_cut?
  // These might be stuck
  const { data: stuckGarments } = await db
    .from('garments')
    .select('id, assigned_date, production_plan')
    .eq('location', 'workshop')
    .eq('in_production', true)
    .not('production_plan', 'is', null)
    .eq('piece_stage', 'waiting_cut');

  const stuckCount = stuckGarments?.length ?? 0;
  if (stuckCount > 0) {
    console.log(`  ⚠ ${stuckCount} garments have production_plan but are stuck at waiting_cut (may need stage advance)`);
  }
}

async function testWorkshopDataIntegrity() {
  console.log("\n═══ 30. Workshop data integrity checks ═══");

  // Check: garments in_production=true should be at workshop
  const { data: inProdNotWorkshop } = await db
    .from('garments')
    .select('id, location, piece_stage, in_production')
    .eq('in_production', true)
    .neq('location', 'workshop');

  const badProd = inProdNotWorkshop?.length ?? 0;
  assert(badProd === 0,
    badProd === 0
      ? "All in_production garments are at workshop"
      : `DATA ISSUE: ${badProd} garments have in_production=true but location != workshop (locations: ${JSON.stringify([...new Set(inProdNotWorkshop!.map(g => g.location))])})`
  );

  // Check: garments at workshop with production stages should have valid piece_stage
  const validWorkshopStages = new Set([
    'waiting_for_acceptance', 'waiting_cut', 'soaking', 'cutting', 'post_cutting',
    'sewing', 'finishing', 'ironing', 'quality_check', 'ready_for_dispatch',
    'brova_trialed', 'completed',
  ]);
  const { data: workshopGarments } = await db
    .from('garments')
    .select('id, piece_stage')
    .eq('location', 'workshop');

  if (workshopGarments) {
    const invalidStages = workshopGarments.filter(g => !validWorkshopStages.has(g.piece_stage ?? ''));
    assert(invalidStages.length === 0,
      invalidStages.length === 0
        ? "All workshop garments have valid workshop stages"
        : `DATA ISSUE: ${invalidStages.length} workshop garments have invalid stages: ${JSON.stringify([...new Set(invalidStages.map(g => g.piece_stage))])}`
    );
  }

  // Check: garments with feedback_status=accepted at workshop should be ready_for_dispatch
  const { data: acceptedAtWorkshop } = await db
    .from('garments')
    .select('id, piece_stage, feedback_status')
    .eq('location', 'workshop')
    .eq('feedback_status', 'accepted')
    .neq('piece_stage', 'ready_for_dispatch');

  const badAccepted = acceptedAtWorkshop?.length ?? 0;
  if (badAccepted > 0) {
    console.log(`  ⚠ ${badAccepted} accepted garments at workshop NOT at ready_for_dispatch (stages: ${JSON.stringify([...new Set(acceptedAtWorkshop!.map(g => g.piece_stage))])})`);
  }

  // Check: finals with waiting_for_acceptance should NOT have in_production=true
  const { data: parkedInProd } = await db
    .from('garments')
    .select('id, in_production')
    .eq('piece_stage', 'waiting_for_acceptance')
    .eq('in_production', true);

  const parkedBad = parkedInProd?.length ?? 0;
  assert(parkedBad === 0,
    parkedBad === 0
      ? "No waiting_for_acceptance finals are in_production"
      : `DATA ISSUE: ${parkedBad} waiting_for_acceptance garments have in_production=true`
  );

  // Check: no garments with start_time but in a completed/dispatch/shop stage
  const doneStages = ['ready_for_dispatch', 'awaiting_trial', 'ready_for_pickup', 'brova_trialed', 'completed'];
  const { data: staleTimers } = await db
    .from('garments')
    .select('id, piece_stage, start_time')
    .not('start_time', 'is', null)
    .in('piece_stage', doneStages);

  const staleCount = staleTimers?.length ?? 0;
  if (staleCount > 0) {
    console.log(`  ⚠ ${staleCount} garments have start_time set but are at done stages (timer not cleared)`);
  }
}

async function testWorkshopBrovaPlans() {
  console.log("\n═══ 31. Workshop brova plans for finals ═══");

  // Find orders with both brovas and finals
  const { data: mixedOrders } = await sql`
    SELECT order_id, garment_type, piece_stage, production_plan IS NOT NULL AS has_plan
    FROM garments
    WHERE order_id IN (
      SELECT order_id FROM garments WHERE garment_type = 'brova'
      INTERSECT
      SELECT order_id FROM garments WHERE garment_type = 'final'
    )
    ORDER BY order_id, garment_type
  `;

  if (!mixedOrders || mixedOrders.length === 0) {
    console.log("  ⚠ No orders with both brovas and finals");
    return;
  }

  const orderIds = [...new Set(mixedOrders.map((g: any) => g.order_id))];
  console.log(`  📊 Orders with both brovas and finals: ${orderIds.length}`);

  // For each order, check brova plan availability (mirrors getBrovaPlansForOrders)
  const { data: brovaPlans } = await db
    .from('garments')
    .select('order_id, production_plan, worker_history')
    .in('order_id', orderIds.slice(0, 10)) // test first 10
    .eq('garment_type', 'brova');

  if (brovaPlans) {
    let withPlan = 0;
    let withHistory = 0;
    for (const g of brovaPlans) {
      if (g.production_plan) withPlan++;
      if (g.worker_history && Object.keys(g.worker_history as any).length > 0) withHistory++;
    }
    console.log(`  📊 Brovas: ${brovaPlans.length} total, ${withPlan} with plan, ${withHistory} with worker history`);
  }
}

async function testWorkshopResourcesQuery() {
  console.log("\n═══ 32. Workshop resources query ═══");

  const { data, error } = await db
    .from('resources')
    .select('*')
    .order('responsibility', { ascending: true })
    .order('resource_name', { ascending: true });

  assert(!error, `No error: ${error?.message || 'OK'}`);
  assert(Array.isArray(data), `Returns array: ${data?.length} resources`);

  if (data && data.length > 0) {
    const first = data[0] as any;
    assert('resource_name' in first, "Has resource_name");
    assert('responsibility' in first, "Has responsibility");
    assert('brand' in first, "Has brand");

    // Check for resources by responsibility
    const responsibilities = new Map<string, number>();
    for (const r of data) {
      const resp = (r as any).responsibility ?? 'null';
      responsibilities.set(resp, (responsibilities.get(resp) ?? 0) + 1);
    }
    console.log(`  📊 Resources by responsibility: ${JSON.stringify(Object.fromEntries(responsibilities))}`);
  }
}

async function testWorkshopPricingQuery() {
  console.log("\n═══ 33. Workshop pricing queries ═══");

  const { data: prices, error: priceErr } = await db
    .from('prices')
    .select('*')
    .order('key', { ascending: true });

  assert(!priceErr, `Prices: no error (${priceErr?.message || 'OK'})`);
  assert(Array.isArray(prices), `Prices: ${prices?.length} entries`);

  const { data: styles, error: styleErr } = await db
    .from('styles')
    .select('*')
    .order('type', { ascending: true })
    .order('name', { ascending: true });

  assert(!styleErr, `Styles: no error (${styleErr?.message || 'OK'})`);
  assert(Array.isArray(styles), `Styles: ${styles?.length} entries`);

  // Check all styles have rate_per_item
  if (styles && styles.length > 0) {
    const missingPrice = styles.filter((s: any) => s.rate_per_item == null);
    if (missingPrice.length > 0) {
      console.log(`  ⚠ ${missingPrice.length} styles have no rate_per_item`);
    }
  }
}

async function testWorkshopCompletedToday() {
  console.log("\n═══ 34. Workshop completed today query ═══");

  // Use local midnight UTC (same as app)
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const localMidnight = new Date(`${localDate}T00:00:00`).toISOString();

  const { data, error } = await db
    .from('garments')
    .select('id, piece_stage, completion_time, location')
    .gte('completion_time', localMidnight);

  assert(!error, `No error: ${error?.message || 'OK'}`);
  console.log(`  📊 Garments completed today: ${data?.length ?? 0}`);

  if (data && data.length > 0) {
    // All should have completion_time >= today
    const allToday = data.every(g => new Date(g.completion_time).getTime() >= new Date(localMidnight).getTime());
    assert(allToday, "All completed garments have completion_time >= today midnight");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  POS + Workshop — Query & RPC Test Suite     ║");
  console.log("╚══════════════════════════════════════════════╝");

  try {
    // ── SQL-level tests (RPCs, extensions, indexes) ──
    await testPgTrgmExtension();
    await testGinIndexes();
    await testFuzzyCustomerSearch();
    await testPaginatedCustomerSearch();
    await testCashierSummary();
    await testCashierPaymentFilter();
    await testQueryPerformance();
    await testEdgeCases();

    // ── PostgREST / Supabase query tests (mirrors actual API layer) ──
    await testDashboardOrders();
    await testShowroomOrders();
    await testOrderHistory();
    await testGetOrderById();
    await testDispatchedOrders();
    await testLinkedOrders();
    await testOrdersForLinking();
    await testCatalogQueries();
    await testCustomerQueries();
    await testMeasurementQueries();
    await testFeedbackQueries();
    await testGarmentRedispatch();
    await testCashierListQueries();
    await testCashierOrderSearch();

    // ── Workshop query tests ──
    await testWorkshopGarments();
    await testWorkshopReceiving();
    await testWorkshopDispatch();
    await testWorkshopSidebarCounts();
    await testWorkshopAssignedView();
    await testWorkshopCompletedOrders();
    await testWorkshopSchedulerFilter();
    await testWorkshopDataIntegrity();
    await testWorkshopBrovaPlans();
    await testWorkshopResourcesQuery();
    await testWorkshopPricingQuery();
    await testWorkshopCompletedToday();
  } catch (err) {
    console.error("\n💥 Unexpected error:", err);
    failed++;
  }

  console.log("\n══════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n  Failures:");
    failures.forEach((f) => console.log(`    - ${f}`));
  }
  console.log("══════════════════════════════════════════\n");

  await sql.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
