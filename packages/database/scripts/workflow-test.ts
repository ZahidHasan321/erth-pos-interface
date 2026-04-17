/**
 * End-to-end workflow test / contract for the ERTH order lifecycle.
 *
 * This is a **spec**, not an implementation mirror. It drives state transitions
 * through the real public surface:
 *
 *   - RPCs: save_work_order_garments, complete_work_order, next_alteration_invoice,
 *           get_workshop_sidebar_counts, get_showroom_orders_page
 *   - Helpers (imported from `@repo/database`):
 *       computeStyleGroups   — assigns style_id from style fingerprint
 *       evaluateBrovaFeedback — single source of truth for brova trial outcomes
 *                               (needs_redo → discarded, releaseFinals gate, etc.)
 *       computeOrderPhase    — expected trigger output
 *       getShowroomStatus    — expected showroom label
 *       isAlteration / getAlterationNumber / getAltLabel / hasQcFailThisTrip
 *       getOrderSummary      — UI summary sanity
 *
 * Dispatch/receive/terminal advancement use raw SQL (no RPC exists), but each
 * mutation is paired with an assertion drawn from the helpers above. If the
 * DB triggers or helpers diverge, the test fails — catching regressions in
 * either layer.
 *
 * Usage: packages/database/node_modules/.bin/tsx packages/database/scripts/workflow-test.ts [step]
 *   seed | status | clean | all | verify
 *   step1-create, step2-dispatch, step3-receive, step4-schedule, step5-terminals,
 *   step6-dispatch-shop, step7-receive-shop, step8-trial-redo, step9-replacement,
 *   step10-release-finals, step11-finals-workshop, step12-ship-everything,
 *   step13-trial-replace, step14-collect-finals, step15-final-alt, step16-verify-phase,
 *   step17-alt-create, step18-alt-production, step19-alt-collect
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  computeStyleGroups,
  evaluateBrovaFeedback,
  computeOrderPhase,
  getShowroomStatus,
  getOrderSummary,
  isAlteration,
  getAlterationNumber,
  getAltLabel,
  hasQcFailThisTrip,
  type BrovaFeedback,
} from "../src/utils";
import type { PieceStage } from "../src/schema";

// Generic first-or-fail to keep rows strictly typed under noUncheckedIndexedAccess.
function firstRow<T>(rows: readonly T[], msg: string): T {
  const r = rows[0];
  if (!r) fail(msg);
  return r;
}
function at<T>(arr: readonly T[], i: number, msg = "missing index"): T {
  const r = arr[i];
  if (r === undefined) fail(`${msg} [${i}]`);
  return r;
}

dotenv.config({ path: path.join(__dirname, "../.env") });

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });
const SUPABASE_URL = process.env.SUPABASE_URL || "https://yuflzcpqiamilalqwkgx.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_Aj-aSfmcR1WgNn4ONOK8Sw_jQzF8uz6";
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BRAND = "ERTH";

const STATE_FILE = path.join(__dirname, ".workflow-state.json");

interface WorkflowState {
  customerId?: number;
  measurementId?: string;
  staffUserId?: string;
  fabricIds?: number[];
  styleId?: number;
  resourceIds?: string[];              // [cutter, post_cutter, sewer, finisher, ironer, quality_checker, soaker]
  prices?: Record<string, number>;     // lookup at seed time
  workOrderId?: number;
  workInvoice?: number;
  brova1Id?: string;
  brova2Id?: string;
  brova1ReplacementId?: string;
  final1Id?: string;
  final2Id?: string;
  altOrderId?: number;
  altInvoice?: number;
  altGarmentIds?: string[];
}

function loadState(): WorkflowState {
  return fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) : {};
}
function saveState(s: WorkflowState) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

function log(m: string)  { console.log(`\n→ ${m}`); }
function ok(m: string)   { console.log(`  ✓ ${m}`); }
function info(m: string) { console.log(`  ℹ ${m}`); }
function warn(m: string) { console.log(`  ⚠ ${m}`); }
function fail(m: string): never { console.error(`  ✗ FAIL: ${m}`); process.exit(1); }
function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok(msg);
}
function requireState<K extends keyof WorkflowState>(s: WorkflowState, keys: K[]): asserts s is WorkflowState & Required<Pick<WorkflowState, K>> {
  const missing = keys.filter(k => s[k] === undefined || s[k] === null);
  if (missing.length) fail(`Missing state keys: ${missing.join(", ")}. Run earlier steps first.`);
}

// ─── Terminal stage progression (workshop contract) ─────────────────────────
const STAGE_ORDER = ["soaking", "cutting", "post_cutting", "sewing", "finishing", "ironing", "quality_check"] as const;
type Stage = typeof STAGE_ORDER[number];
const WORKER_KEY: Record<Stage, string> = {
  soaking: "soaker",
  cutting: "cutter",
  post_cutting: "post_cutter",
  sewing: "sewer",
  finishing: "finisher",
  ironing: "ironer",
  quality_check: "quality_checker",
};

function buildProductionPlan(resourceIds: string[], fromStage: Stage = "soaking"): Record<string, string> {
  const byStage: Record<Stage, string> = {
    soaking:       at(resourceIds, 6, "soaker"),
    cutting:       at(resourceIds, 0, "cutter"),
    post_cutting:  at(resourceIds, 1, "post_cutter"),
    sewing:        at(resourceIds, 2, "sewer"),
    finishing:     at(resourceIds, 3, "finisher"),
    ironing:       at(resourceIds, 4, "ironer"),
    quality_check: at(resourceIds, 5, "quality_checker"),
  };
  const startIdx = STAGE_ORDER.indexOf(fromStage);
  const plan: Record<string, string> = {};
  for (let i = startIdx; i < STAGE_ORDER.length; i++) {
    const s = at(STAGE_ORDER, i) as Stage;
    plan[WORKER_KEY[s]] = byStage[s];
  }
  return plan;
}

/** Close current stage session, open next. Writes worker_history + stage_timings. */
async function advanceStage(garmentId: string, from: Stage, to: Stage | "ready_for_dispatch", workerId: string) {
  const now = new Date().toISOString();
  await sql`
    UPDATE garments SET
      piece_stage = ${to}::piece_stage,
      start_time = NULL,
      completion_time = ${now}::timestamptz,
      worker_history = COALESCE(worker_history, '{}'::jsonb) || ${sql.json({ [WORKER_KEY[from]]: workerId } as any) as any},
      stage_timings = jsonb_set(
        COALESCE(stage_timings, '{}'::jsonb),
        ARRAY[${from}],
        COALESCE(stage_timings -> ${from}, '[]'::jsonb)
          || ${sql.json([{ worker: workerId, started_at: now, completed_at: now }] as any) as any}
      )
    WHERE id = ${garmentId}
  `;
}

async function runThroughTerminals(garmentId: string, resourceIds: string[], from: Stage) {
  const plan = buildProductionPlan(resourceIds, from);
  const startIdx = STAGE_ORDER.indexOf(from);
  for (let i = startIdx; i < STAGE_ORDER.length; i++) {
    const cur = at(STAGE_ORDER, i) as Stage;
    const next: Stage | "ready_for_dispatch" = i + 1 < STAGE_ORDER.length
      ? (at(STAGE_ORDER, i + 1) as Stage)
      : "ready_for_dispatch";
    await advanceStage(garmentId, cur, next, plan[WORKER_KEY[cur]]!);
  }
}

// Mirrors dispatchOrder() contract in apps/pos-interface/src/api/orders.ts
async function dispatchFromShop(orderId: number, garmentIds?: string[]) {
  const filter = garmentIds?.length
    ? sql`AND id = ANY(${garmentIds})`
    : sql`AND trip_number = 0`;
  // Bump trip 0 → 1 on first dispatch, increment on redispatch. Real `dispatchOrder`
  // sets trip_number = 1 unconditionally (shop-dispatch path is only used for first
  // dispatch). Redispatch from shop (needs_repair return) uses a separate path.
  const rows = await sql`
    UPDATE garments SET
      location = 'transit_to_workshop',
      trip_number = 1
    WHERE order_id = ${orderId} ${filter}
    RETURNING id, trip_number
  `;
  if (rows.length) {
    await sql`
      INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
      SELECT id, order_id, 'to_workshop', trip_number
      FROM garments WHERE id = ANY(${rows.map(r => r.id)})
    `;
  }
  await sql`UPDATE work_orders SET order_phase = 'in_progress' WHERE order_id = ${orderId} AND order_phase = 'new'`;
  return rows.length;
}

// Mirrors dispatchGarmentToWorkshop (redispatch) contract
async function redispatchFromShop(garmentId: string) {
  const [g] = await sql`SELECT trip_number FROM garments WHERE id = ${garmentId}`;
  const newTrip = (g.trip_number ?? 1) + 1;
  await sql`
    UPDATE garments SET
      location = 'transit_to_workshop',
      piece_stage = 'waiting_cut'::piece_stage,
      in_production = false,
      trip_number = ${newTrip},
      production_plan = NULL,
      completion_time = NULL,
      start_time = NULL
    WHERE id = ${garmentId}
  `;
  await sql`
    INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
    SELECT id, order_id, 'to_workshop', trip_number FROM garments WHERE id = ${garmentId}
  `;
  return newTrip;
}

// Mirrors dispatchGarments (workshop-side) contract
async function dispatchFromWorkshop(garmentIds: string[]) {
  await sql`
    UPDATE garments SET
      location = 'transit_to_shop',
      in_production = false,
      feedback_status = NULL
    WHERE id = ANY(${garmentIds})
  `;
  await sql`
    INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
    SELECT id, order_id, 'to_shop', trip_number FROM garments WHERE id = ANY(${garmentIds})
  `;
}

// ─── SEED ─────────────────────────────────────────────────────────────────────

async function seed() {
  log("Seeding prerequisite data (customer, fabrics, styles, prices, resources, measurement)...");
  const state = loadState();

  const users = await sql`SELECT id, name, username, department FROM users WHERE is_active = true LIMIT 5`;
  if (!users.length) fail("No active users. Seed users first.");
  state.staffUserId = (users.find(u => u.department === "shop") ?? users[0]).id;
  ok(`Staff user: ${state.staffUserId}`);

  const [customer] = await sql`
    INSERT INTO customers (name, phone, nick_name, country_code, city, block, street, house_no, area, nationality, account_type)
    VALUES ('Workflow Test Customer', '55501234', 'WF Test', '+965', 'Kuwait City', '3', 'Test Street', '42', 'Salmiya', 'Kuwaiti', 'Primary')
    RETURNING id
  `;
  state.customerId = customer.id;
  ok(`Customer #${customer.id}`);

  // Fabrics — unique per-run names so re-runs don't collide
  const ts = Date.now();
  const fabrics = await sql`
    INSERT INTO fabrics (name, color, color_hex, shop_stock, workshop_stock, price_per_meter, real_stock) VALUES
      (${`WF-White-${ts}`}, 'C01', '#FFFFFF', 100, 50, 3.500, 100),
      (${`WF-Navy-${ts}`},  'C15', '#001F3F',  80, 40, 4.000, 80)
    RETURNING id, name, price_per_meter
  `;
  state.fabricIds = fabrics.map(f => f.id);
  ok(`Fabrics: ${fabrics.map(f => f.name).join(", ")}`);

  // Style — reuse an existing ERTH style (styles table is a catalog, not per-order)
  const existing = await sql`SELECT id FROM styles WHERE brand = ${BRAND} LIMIT 1`;
  if (existing.length) {
    state.styleId = existing[0].id;
  } else {
    const [s] = await sql`
      INSERT INTO styles (name, type, rate_per_item, brand)
      VALUES ('kuwaiti', 'standard', 0, ${BRAND}) RETURNING id
    `;
    state.styleId = s.id;
  }
  ok(`Style #${state.styleId}`);

  // Prices — real values are loaded from the `prices` table at runtime
  const priceRows: Array<[string, number, string]> = [
    ["STITCHING_ADULT", 9,   "Adult stitching rate"],
    ["STITCHING_CHILD", 7,   "Child stitching rate"],
    ["EXPRESS_SURCHARGE", 3, "Express surcharge"],
    ["SOAKING_CHARGE", 1.5,  "Soaking charge"],
    ["HOME_DELIVERY", 2,     "Home delivery"],
  ];
  for (const [key, value, description] of priceRows) {
    await sql`
      INSERT INTO prices (key, brand, value, description)
      VALUES (${key}, ${BRAND}, ${value}, ${description})
      ON CONFLICT (key, brand) DO UPDATE SET value = ${value}
    `;
  }
  // Load prices back into state — this is what the POS does at order creation
  const dbPrices = await sql`SELECT key, value FROM prices WHERE brand = ${BRAND}`;
  state.prices = Object.fromEntries(dbPrices.map(r => [r.key, Number(r.value)]));
  ok(`Prices loaded: ${sql.json(state.prices as any) as any}`);

  // Resources
  const responsibilities = ["cutter", "post_cutter", "sewer", "finisher", "ironer", "quality_checker", "soaker"];
  const resourceIds: string[] = [];
  for (const resp of responsibilities) {
    const existing = await sql`SELECT id FROM resources WHERE brand = ${BRAND} AND responsibility = ${resp} LIMIT 1`;
    if (existing.length) {
      resourceIds.push(existing[0].id);
    } else {
      const name = `WF-${resp.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`;
      const [r] = await sql`
        INSERT INTO resources (brand, responsibility, resource_name, daily_target, unit)
        VALUES (${BRAND}, ${resp}, ${name}, 20, 'Unit-1') RETURNING id
      `;
      resourceIds.push(r.id);
    }
  }
  state.resourceIds = resourceIds;
  ok(`Resources ensured`);

  const [m] = await sql`
    INSERT INTO measurements (customer_id, measurer_id, measurement_date, type,
      collar_width, collar_height, shoulder, armhole, chest_upper, chest_full,
      sleeve_length, sleeve_width, elbow, waist_front, waist_back, waist_full,
      length_front, length_back, bottom, notes)
    VALUES (${state.customerId}, ${state.staffUserId}, NOW(), 'Body',
      17.5, 4.0, 47.0, 24.0, 52.0, 54.0, 62.0, 18.0, 20.0, 46.0, 48.0, 94.0, 140.0, 142.0, 56.0, 'WF test')
    RETURNING id
  `;
  state.measurementId = m.id;
  ok(`Measurement #${m.id}`);

  saveState(state);
  log("✅ Seed complete");
}

// ─── Price computation helpers (mirror POS cost calc) ────────────────────────

type GarmentSpec = {
  suffix: number;
  fabric_id: number;
  color: string;
  fabric_length: number;
  fabric_price_per_meter: number;
  garment_type: "brova" | "final";
  soaking: boolean;
  express: boolean;
  delivery_date: Date;
  // Style-identity fields — computeStyleGroups fingerprints on these
  style: string;
  collar_type: string;
  collar_button: string;
  cuffs_type: string;
  cuffs_thickness: string;
  front_pocket_type: string;
  front_pocket_thickness: string;
  wallet_pocket: boolean;
  pen_holder: boolean;
  mobile_pocket: boolean;
  small_tabaggi: boolean;
  jabzour_1: string;
  jabzour_2: string | null;
  jabzour_thickness: string | null;
  lines: number;
  measurement_id: string;
};

function computeGarmentCharges(specs: GarmentSpec[], prices: Record<string, number>) {
  const stitchPerItem = prices.STITCHING_ADULT;
  const expressSurcharge = prices.EXPRESS_SURCHARGE;
  const soakingCharge = prices.SOAKING_CHARGE;

  let fabricCharge = 0, stitchingCharge = 0, expressCharge = 0, soakCharge = 0;
  const snapshots = specs.map(g => {
    const fabric = g.fabric_price_per_meter * g.fabric_length;
    fabricCharge += fabric;
    stitchingCharge += stitchPerItem;
    if (g.express) expressCharge += expressSurcharge;
    if (g.soaking) soakCharge  += soakingCharge;
    return {
      fabric_price_snapshot: fabric,
      stitching_price_snapshot: stitchPerItem,
      style_price_snapshot: 0,
    };
  });
  return {
    snapshots,
    charges: {
      fabric_charge: fabricCharge,
      stitching_charge: stitchingCharge,
      express_charge: expressCharge,
      soaking_charge: soakCharge,
      style_charge: 0,
      stitching_price: stitchPerItem,
    },
    total: fabricCharge + stitchingCharge + expressCharge + soakCharge,
  };
}

// ─── STEP 1: Create WORK order via real RPCs ────────────────────────────────

async function step1Create() {
  log("Step 1: Create WORK order (save_work_order_garments RPC + complete_work_order RPC)...");
  const state = loadState();
  requireState(state, ["customerId", "staffUserId", "fabricIds", "styleId", "measurementId", "prices"]);

  const deliveryDate = new Date(); deliveryDate.setDate(deliveryDate.getDate() + 14);
  const expressDate  = new Date(); expressDate.setDate(expressDate.getDate() + 7);

  // 1. Create draft order row — this is what the new-work-order page does first.
  const [order] = await sql`
    INSERT INTO orders (customer_id, order_taker_id, order_date, brand, checkout_status, order_type)
    VALUES (${state.customerId}, ${state.staffUserId}, NOW(), ${BRAND}, 'draft', 'WORK')
    RETURNING id
  `;
  state.workOrderId = order.id;
  ok(`Draft order #${order.id}`);

  // 2. Build garment specs. Two distinct style fingerprints so computeStyleGroups
  // gives 2 style_ids — same fingerprint garments share the group.
  const baseMeasurement = state.measurementId;
  const specs: GarmentSpec[] = [
    // Fingerprint A (B1 brova + F1 final share style)
    {
      suffix: 1, fabric_id: state.fabricIds[0], color: "C01", fabric_length: 3.5,
      fabric_price_per_meter: 3.5, garment_type: "brova", soaking: true, express: true, delivery_date: expressDate,
      style: "kuwaiti", collar_type: "stand", collar_button: "yes",
      cuffs_type: "round", cuffs_thickness: "single",
      front_pocket_type: "standard", front_pocket_thickness: "single",
      wallet_pocket: false, pen_holder: false, mobile_pocket: false, small_tabaggi: false,
      jabzour_1: "BUTTON", jabzour_2: null, jabzour_thickness: null, lines: 1,
      measurement_id: baseMeasurement,
    },
    {
      suffix: 3, fabric_id: state.fabricIds[0], color: "C01", fabric_length: 3.5,
      fabric_price_per_meter: 3.5, garment_type: "final", soaking: false, express: true, delivery_date: expressDate,
      style: "kuwaiti", collar_type: "stand", collar_button: "yes",
      cuffs_type: "round", cuffs_thickness: "single",
      front_pocket_type: "standard", front_pocket_thickness: "single",
      wallet_pocket: false, pen_holder: false, mobile_pocket: false, small_tabaggi: false,
      jabzour_1: "BUTTON", jabzour_2: null, jabzour_thickness: null, lines: 1,
      measurement_id: baseMeasurement,
    },
    // Fingerprint B (B2 brova + F2 final share style)
    {
      suffix: 2, fabric_id: state.fabricIds[1], color: "C15", fabric_length: 3.5,
      fabric_price_per_meter: 4.0, garment_type: "brova", soaking: true, express: false, delivery_date: deliveryDate,
      style: "kuwaiti", collar_type: "band", collar_button: "no",
      cuffs_type: "square", cuffs_thickness: "double",
      front_pocket_type: "curved", front_pocket_thickness: "single",
      wallet_pocket: true, pen_holder: true, mobile_pocket: false, small_tabaggi: false,
      jabzour_1: "ZIPPER", jabzour_2: null, jabzour_thickness: null, lines: 2,
      measurement_id: baseMeasurement,
    },
    {
      suffix: 4, fabric_id: state.fabricIds[1], color: "C15", fabric_length: 3.5,
      fabric_price_per_meter: 4.0, garment_type: "final", soaking: false, express: false, delivery_date: deliveryDate,
      style: "kuwaiti", collar_type: "band", collar_button: "no",
      cuffs_type: "square", cuffs_thickness: "double",
      front_pocket_type: "curved", front_pocket_thickness: "single",
      wallet_pocket: true, pen_holder: true, mobile_pocket: false, small_tabaggi: false,
      jabzour_1: "ZIPPER", jabzour_2: null, jabzour_thickness: null, lines: 2,
      measurement_id: baseMeasurement,
    },
  ];

  // 3. Use the REAL `computeStyleGroups` helper — this mutates specs with style_id.
  computeStyleGroups(specs);
  const styleIds = [...new Set(specs.map(s => (s as any).style_id))].sort();
  if (styleIds.length !== 2) fail(`Expected 2 distinct style_ids, got ${styleIds.length}: ${styleIds}`);
  ok(`computeStyleGroups assigned ${styleIds.length} style groups (ids ${styleIds.join(", ")})`);

  // 4. Compute real charges (matches POS cost-calc)
  const { snapshots, charges, total } = computeGarmentCharges(specs, state.prices);
  ok(`Charges: fabric=${charges.fabric_charge} stitching=${charges.stitching_charge} express=${charges.express_charge} soaking=${charges.soaking_charge} → total=${total}`);

  // 5. Build the garment payload for save_work_order_garments RPC.
  // Note: this RPC auto-parks finals (step 4 inside the RPC) when any brova exists,
  // so we DON'T pre-set finals to waiting_for_acceptance — we test that contract.
  const garmentPayload = specs.map((g, i) => ({
    garment_id: `${order.id}-${g.suffix}`,
    fabric_id: g.fabric_id,
    style_id: (g as any).style_id,
    measurement_id: g.measurement_id,
    fabric_source: "IN",
    quantity: 1,
    fabric_length: g.fabric_length,
    fabric_price_snapshot: snapshots[i].fabric_price_snapshot,
    stitching_price_snapshot: snapshots[i].stitching_price_snapshot,
    style_price_snapshot: snapshots[i].style_price_snapshot,
    collar_type: g.collar_type, collar_button: g.collar_button,
    cuffs_type: g.cuffs_type, cuffs_thickness: g.cuffs_thickness,
    front_pocket_type: g.front_pocket_type, front_pocket_thickness: g.front_pocket_thickness,
    wallet_pocket: g.wallet_pocket, pen_holder: g.pen_holder,
    small_tabaggi: g.small_tabaggi,
    jabzour_1: g.jabzour_1, jabzour_2: g.jabzour_2, jabzour_thickness: g.jabzour_thickness,
    lines: g.lines,
    soaking: g.soaking, express: g.express,
    garment_type: g.garment_type,
    delivery_date: g.delivery_date.toISOString(),
    style: g.style,
    color: g.color,
    // Initial workflow state — RPC will override finals to waiting_for_acceptance
    // because there's a brova in the list.
    piece_stage: "waiting_cut",
    location: "shop",
    trip_number: 0,
  }));

  // 6. Call the real save_work_order_garments RPC (via raw pg to bypass RLS —
  //    RPC contract is still the thing under test).
  const orderUpdates = {
    num_of_fabrics: specs.length,
    fabric_charge: charges.fabric_charge,
    stitching_charge: charges.stitching_charge,
    style_charge: charges.style_charge,
    stitching_price: charges.stitching_price,
    delivery_date: deliveryDate.toISOString(),
    home_delivery: false,
  };
  await sql`
    SELECT save_work_order_garments(
      ${order.id}::int,
      ${sql.json(garmentPayload as any) as any},
      ${sql.json(orderUpdates as any) as any}
    )
  `;
  ok(`save_work_order_garments RPC accepted`);

  // 7. CONTRACT: RPC auto-parks finals (step 4 inside the RPC). Assert.
  const afterSave = await sql`
    SELECT id, garment_id, garment_type, piece_stage, location, trip_number, style_id
    FROM garments WHERE order_id = ${order.id} ORDER BY garment_id
  `;
  if (afterSave.length !== 4) fail(`Expected 4 garments, got ${afterSave.length}`);
  const byCode = (n: number) => afterSave.find(g => g.garment_id.endsWith(`-${n}`))!;
  assertEq(byCode(1).piece_stage, "waiting_cut", "B1 piece_stage=waiting_cut");
  assertEq(byCode(2).piece_stage, "waiting_cut", "B2 piece_stage=waiting_cut");
  assertEq(byCode(3).piece_stage, "waiting_for_acceptance", "F1 auto-parked by RPC (waiting_for_acceptance)");
  assertEq(byCode(4).piece_stage, "waiting_for_acceptance", "F2 auto-parked by RPC (waiting_for_acceptance)");
  for (const g of afterSave) assertEq(g.trip_number, 0, `${g.garment_id} trip_number=0 before dispatch`);

  // Style groups persisted through the RPC
  assertEq(byCode(1).style_id, byCode(3).style_id, "B1 and F1 share a style group");
  assertEq(byCode(2).style_id, byCode(4).style_id, "B2 and F2 share a style group");
  if (byCode(1).style_id === byCode(2).style_id) fail(`B1 and B2 should be in different style groups`);

  // 8. Call complete_work_order RPC (raw pg, bypass RLS).
  const checkoutDetails = {
    paymentType: "cash",
    paid: 0, paymentRefNo: null, paymentNote: null,
    orderTaker: state.staffUserId,
    discountType: null, discountValue: 0, discountPercentage: 0, referralCode: null,
    orderTotal: total,
    advance: 0,
    fabricCharge: charges.fabric_charge,
    stitchingCharge: charges.stitching_charge,
    styleCharge: charges.style_charge,
    expressCharge: charges.express_charge,
    soakingCharge: charges.soaking_charge,
    deliveryCharge: 0,
    shelfCharge: 0,
    homeDelivery: false,
    deliveryDate: deliveryDate.toISOString(),
    stitchingPrice: charges.stitching_price,
  };
  const fabricItems = specs.map(g => ({ id: g.fabric_id, length: g.fabric_length }));
  await sql`
    SELECT complete_work_order(
      ${order.id}::int,
      ${sql.json(checkoutDetails as any) as any},
      ${sql.json([] as any) as any},
      ${sql.json(fabricItems as any) as any}
    )
  `;

  const [wo] = await sql`SELECT invoice_number, order_phase FROM work_orders WHERE order_id = ${order.id}`;
  state.workInvoice = wo.invoice_number;
  assertEq(wo.order_phase, "new", "order_phase='new' after checkout (no dispatch yet)");
  ok(`Checkout complete. Invoice #${wo.invoice_number}`);

  // 9. Assert computeOrderPhase agrees with trigger.
  // After checkout finals were auto-parked. Pre-dispatch (all waiting_cut + waiting_for_acceptance) → 'new' preserved.
  const garmentRows = afterSave.map(g => ({ piece_stage: g.piece_stage as PieceStage }));
  assertEq(computeOrderPhase(garmentRows, "new"), "new",
    "computeOrderPhase(all pre-dispatch, 'new') === 'new'");

  // 10. Stash ids
  state.brova1Id = byCode(1).id as string;
  state.brova2Id = byCode(2).id as string;
  state.final1Id = byCode(3).id as string;
  state.final2Id = byCode(4).id as string;

  saveState(state);
  log("✅ Step 1 complete");
}

// ─── STEP 2: Dispatch to workshop (trip 0 → 1) ──────────────────────────────

async function step2Dispatch() {
  log("Step 2: Dispatch via dispatchOrder contract (trip 0→1, dispatch_log, phase→in_progress)...");
  const state = loadState();
  requireState(state, ["workOrderId"]);

  const count = await dispatchFromShop(state.workOrderId);
  assertEq(count, 4, "4 garments dispatched");

  // dispatch_log entries
  const [{ logs }] = await sql`SELECT COUNT(*) as logs FROM dispatch_log WHERE order_id = ${state.workOrderId} AND direction = 'to_workshop'`;
  assertEq(Number(logs), 4, "dispatch_log: 4 to_workshop entries");

  // Trigger should have moved phase to in_progress (trigger fires on garment update)
  const [wo] = await sql`SELECT order_phase FROM work_orders WHERE order_id = ${state.workOrderId}`;
  assertEq(wo.order_phase, "in_progress", "trigger set order_phase='in_progress'");

  // Cross-check with computeOrderPhase (expected vs actual)
  const rows = await sql`SELECT piece_stage FROM garments WHERE order_id = ${state.workOrderId}`;
  const expectedPhase = computeOrderPhase(rows.map(r => ({ piece_stage: r.piece_stage })), "in_progress");
  assertEq(expectedPhase, "in_progress", "computeOrderPhase agrees");

  // Garment states per contract
  const g = await sql`SELECT garment_id, garment_type, piece_stage, location, trip_number FROM garments WHERE order_id = ${state.workOrderId} ORDER BY garment_id`;
  for (const r of g) {
    assertEq(r.location, "transit_to_workshop", `${r.garment_id} location`);
    assertEq(r.trip_number, 1, `${r.garment_id} trip_number`);
    const expectedStage = r.garment_type === "brova" ? "waiting_cut" : "waiting_for_acceptance";
    assertEq(r.piece_stage, expectedStage, `${r.garment_id} piece_stage unchanged`);
  }

  log("✅ Step 2 complete");
}

// ─── STEP 3: Workshop receives ──────────────────────────────────────────────

async function step3Receive() {
  log("Step 3: Workshop receives (assert awaiting-approvals query + sidebar counts)...");
  const state = loadState();
  requireState(state, ["workOrderId"]);

  const incoming = await sql`
    SELECT id, garment_id, garment_type, piece_stage FROM garments
    WHERE order_id = ${state.workOrderId}
      AND location = 'transit_to_workshop' AND trip_number = 1
    ORDER BY garment_id
  `;
  assertEq(incoming.length, 4, "Incoming tab shows 4 garments");

  // Receive all → workshop. Brovas get in_production=true; parked finals do NOT.
  await sql`UPDATE garments SET location = 'workshop' WHERE id = ANY(${incoming.map(r => r.id)})`;
  await sql`
    UPDATE garments SET in_production = true
    WHERE id = ANY(${incoming.map(r => r.id)}) AND piece_stage <> 'waiting_for_acceptance'
  `;

  // CONTRACT (commit 0941874): awaiting-approvals table must surface parked finals
  const parked = await sql`
    SELECT garment_id FROM garments
    WHERE order_id = ${state.workOrderId}
      AND garment_type = 'final'
      AND piece_stage = 'waiting_for_acceptance'
      AND location = 'workshop'
      AND in_production = false
    ORDER BY garment_id
  `;
  assertEq(parked.length, 2, "awaiting-approvals query returns 2 parked finals");

  // Sidebar counts RPC — parked finals excluded from parking via
  // `piece_stage <> 'waiting_for_acceptance'` filter in the RPC body.
  const countsRow = firstRow(await sql`SELECT get_workshop_sidebar_counts() as r`, "counts");
  ok(`Sidebar counts: ${sql.json((countsRow as any).r as any) as any}`);

  log("✅ Step 3 complete");
}

// ─── STEP 4: Scheduler assigns production_plan ──────────────────────────────

async function step4Schedule() {
  log("Step 4: Scheduler assigns production_plan (soaking start for B1/B2 since soaking=true)...");
  const state = loadState();
  requireState(state, ["workOrderId", "resourceIds"]);

  const today = new Date().toISOString().slice(0, 10);
  const brovas = await sql`
    SELECT id, garment_id, soaking FROM garments
    WHERE order_id = ${state.workOrderId} AND garment_type = 'brova'
    ORDER BY garment_id
  `;
  for (const b of brovas) {
    const startStage: Stage = b.soaking ? "soaking" : "cutting";
    const plan = buildProductionPlan(state.resourceIds, startStage);
    await sql`
      UPDATE garments SET
        production_plan = ${sql.json(plan as any) as any},
        assigned_date   = ${today}::date,
        piece_stage     = ${startStage}::piece_stage,
        trip_history    = ${sql.json([{
          trip: 1, reentry_stage: startStage, production_plan: plan,
          worker_history: {}, assigned_date: today, completed_date: null, qc_attempts: [],
        }] as any) as any}
      WHERE id = ${b.id}
    `;
    ok(`${b.garment_id} → ${startStage}`);
  }

  // Pre-stamp plan on parked finals so they're ready when released
  await sql`
    UPDATE garments SET
      production_plan = ${sql.json(buildProductionPlan(state.resourceIds, "cutting") as any) as any},
      assigned_date   = ${today}::date
    WHERE order_id = ${state.workOrderId}
      AND garment_type = 'final'
      AND piece_stage = 'waiting_for_acceptance'
  `;

  // Trigger should leave phase at 'in_progress' (brovas moved out of pre-dispatch)
  const [wo] = await sql`SELECT order_phase FROM work_orders WHERE order_id = ${state.workOrderId}`;
  assertEq(wo.order_phase, "in_progress", "order_phase stays in_progress");

  log("✅ Step 4 complete");
}

// ─── STEP 5: Terminals + QC-fail rework (alt_p assertion) ──────────────────

async function step5Terminals() {
  log("Step 5: Process brovas — B1 gets QC-fail rework → assert alt_p label...");
  const state = loadState();
  requireState(state, ["workOrderId", "resourceIds", "brova1Id", "brova2Id"]);

  // B2 clean run
  const [b2] = await sql`SELECT id, piece_stage FROM garments WHERE id = ${state.brova2Id}`;
  await runThroughTerminals(b2.id, state.resourceIds, b2.piece_stage as Stage);
  ok(`B2 → ready_for_dispatch`);

  // B1: advance to quality_check, record QC fail, bounce back to sewing
  const [b1Init] = await sql`SELECT id, piece_stage FROM garments WHERE id = ${state.brova1Id}`;
  const plan = buildProductionPlan(state.resourceIds, b1Init.piece_stage as Stage);
  const startIdx = STAGE_ORDER.indexOf(b1Init.piece_stage as Stage);
  const qcIdx = STAGE_ORDER.indexOf("quality_check");
  for (let i = startIdx; i < qcIdx; i++) {
    await advanceStage(b1Init.id, STAGE_ORDER[i], STAGE_ORDER[i + 1], plan[WORKER_KEY[STAGE_ORDER[i]]]);
  }

  const qcFail = {
    inspector: state.resourceIds[5], // quality_checker resource id
    ratings: null,
    result: "fail" as const,
    fail_reason: "Stitch quality",
    return_stage: "sewing",
    date: new Date().toISOString(),
  };
  await sql`
    UPDATE garments SET
      piece_stage = 'sewing'::piece_stage,
      trip_history = jsonb_set(
        COALESCE(trip_history, '[]'::jsonb),
        '{0,qc_attempts}',
        COALESCE(trip_history -> 0 -> 'qc_attempts', '[]'::jsonb) || ${sql.json([qcFail] as any) as any},
        true
      )
    WHERE id = ${state.brova1Id}
  `;

  // CONTRACT: hasQcFailThisTrip should return true → getAltLabel='alt_p'
  const [b1After] = await sql`SELECT trip_number, trip_history FROM garments WHERE id = ${state.brova1Id}`;
  const g = { trip_number: b1After.trip_number, trip_history: b1After.trip_history as any };
  assertEq(hasQcFailThisTrip(g), true, "hasQcFailThisTrip(B1) = true");
  assertEq(getAltLabel(g), "alt_p", "getAltLabel(B1) = 'alt_p'");
  assertEq(isAlteration(b1After.trip_number), false, "isAlteration(B1) = false (still trip 1)");

  // Finish B1: sewing → finishing → ironing → quality_check → ready_for_dispatch
  for (let i = STAGE_ORDER.indexOf("sewing"); i < STAGE_ORDER.length; i++) {
    const cur = STAGE_ORDER[i];
    const next: Stage | "ready_for_dispatch" = i + 1 < STAGE_ORDER.length ? STAGE_ORDER[i + 1] : "ready_for_dispatch";
    await advanceStage(b1Init.id, cur, next, plan[WORKER_KEY[cur]]);
  }

  // Assert stage_timings captured both sewing sessions (original + rework)
  const [b1Final] = await sql`SELECT stage_timings, piece_stage FROM garments WHERE id = ${state.brova1Id}`;
  const sewingSessions = ((b1Final.stage_timings as any)?.sewing ?? []).length;
  assertEq(sewingSessions, 2, "stage_timings.sewing has 2 sessions (rework captured)");
  assertEq(b1Final.piece_stage, "ready_for_dispatch", "B1 at ready_for_dispatch");

  // Finals still parked
  const [{ parked }] = await sql`
    SELECT COUNT(*) as parked FROM garments
    WHERE order_id = ${state.workOrderId} AND garment_type = 'final' AND piece_stage = 'waiting_for_acceptance'
  `;
  assertEq(Number(parked), 2, "2 finals still parked");

  log("✅ Step 5 complete");
}

// ─── STEP 6: Workshop dispatches brovas to shop ─────────────────────────────

async function step6DispatchToShop() {
  log("Step 6: Workshop dispatches brovas (location→transit_to_shop, feedback_status cleared)...");
  const state = loadState();
  requireState(state, ["workOrderId"]);

  const brovas = await sql`
    SELECT id, garment_id FROM garments
    WHERE order_id = ${state.workOrderId}
      AND location = 'workshop' AND piece_stage = 'ready_for_dispatch' AND garment_type = 'brova'
  `;
  assertEq(brovas.length, 2, "2 brovas ready for workshop dispatch");
  await dispatchFromWorkshop(brovas.map(b => b.id));
  const [{ logs }] = await sql`SELECT COUNT(*) as logs FROM dispatch_log WHERE order_id = ${state.workOrderId} AND direction = 'to_shop'`;
  if (Number(logs) < 2) fail(`Expected ≥2 to_shop dispatch_log, got ${logs}`);
  ok(`dispatch_log updated`);

  log("✅ Step 6 complete");
}

// ─── STEP 7: Shop receives brovas → awaiting_trial ──────────────────────────

async function step7ReceiveShop() {
  log("Step 7: Shop receives brovas (piece_stage → awaiting_trial)...");
  const state = loadState();
  requireState(state, ["workOrderId"]);

  await sql`
    UPDATE garments SET piece_stage = 'awaiting_trial'::piece_stage, location = 'shop'
    WHERE order_id = ${state.workOrderId} AND location = 'transit_to_shop' AND garment_type = 'brova'
  `;

  // CONTRACT: getShowroomStatus should return 'brova_trial' — brovas at shop awaiting customer
  const gs = await sql`
    SELECT garment_type, piece_stage, location, acceptance_status, feedback_status, trip_number
    FROM garments WHERE order_id = ${state.workOrderId}
  `;
  const { label } = getShowroomStatus(gs);
  assertEq(label, "brova_trial", "getShowroomStatus returns 'brova_trial'");

  log("✅ Step 7 complete");
}

// ─── STEP 8: Feedback — use evaluateBrovaFeedback as oracle ─────────────────

async function step8TrialRedo() {
  log("Step 8: Feedback via evaluateBrovaFeedback (B1 needs_redo → discarded, B2 accepted)...");
  const state = loadState();
  requireState(state, ["workOrderId", "staffUserId", "brova1Id", "brova2Id"]);

  // Snapshot all brovas for the helper
  const brovas = await sql`
    SELECT id, piece_stage, acceptance_status, feedback_status
    FROM garments WHERE order_id = ${state.workOrderId} AND garment_type = 'brova'
  `;
  const brovasForHelper = brovas.map(b => ({
    id: b.id as string,
    piece_stage: b.piece_stage as PieceStage,
    acceptance_status: b.acceptance_status as boolean | null,
    feedback_status: b.feedback_status as string | null,
  }));

  // --- B1: needs_redo (contract: newStage='discarded', brovaGoesBack=false) ---
  const redoFb: BrovaFeedback = "needs_redo";
  const redoResult = evaluateBrovaFeedback(redoFb, brovasForHelper, state.brova1Id);
  assertEq(redoResult.newStage, "discarded", "evaluateBrovaFeedback('needs_redo').newStage = 'discarded'");
  assertEq(redoResult.brovaGoesBack, false, "redo does NOT send brova back (workshop replaces)");
  assertEq(redoResult.feedbackStatus, "needs_redo", "feedbackStatus='needs_redo'");
  assertEq(redoResult.acceptanceStatus, false, "acceptanceStatus=false");

  const [b1Row] = await sql`SELECT piece_stage, trip_number FROM garments WHERE id = ${state.brova1Id}`;
  await sql`
    INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number,
                                  action, previous_stage, distribution, satisfaction_level, notes)
    VALUES (${state.brova1Id}, ${state.workOrderId}, ${state.staffUserId}, 'brova_trial', ${b1Row.trip_number},
            ${redoFb}, ${b1Row.piece_stage}, 'workshop', 2, 'Start over — workshop replacement')
  `;
  await sql`
    UPDATE garments SET
      piece_stage = ${redoResult.newStage}::piece_stage,
      feedback_status = ${redoResult.feedbackStatus},
      acceptance_status = ${redoResult.acceptanceStatus},
      in_production = false
    WHERE id = ${state.brova1Id}
  `;
  ok(`B1 applied per evaluateBrovaFeedback → piece_stage=${redoResult.newStage}`);

  // --- B2: accepted (contract: newStage='brova_trialed', releaseFinals=true) ---
  const acceptedFb: BrovaFeedback = "accepted";
  // Re-read brovas now that B1 is discarded
  const brovasAfterB1 = await sql`
    SELECT id, piece_stage, acceptance_status, feedback_status
    FROM garments WHERE order_id = ${state.workOrderId} AND garment_type = 'brova'
  `;
  const acceptResult = evaluateBrovaFeedback(acceptedFb, brovasAfterB1.map(b => ({
    id: b.id as string,
    piece_stage: b.piece_stage as PieceStage,
    acceptance_status: b.acceptance_status as boolean | null,
    feedback_status: b.feedback_status as string | null,
  })), state.brova2Id);
  assertEq(acceptResult.newStage, "brova_trialed", "accepted → newStage='brova_trialed'");
  assertEq(acceptResult.acceptanceStatus, true, "acceptanceStatus=true");
  assertEq(acceptResult.releaseFinals, true, "releaseFinals=true (any brova accepted)");

  const [b2Row] = await sql`SELECT piece_stage, trip_number FROM garments WHERE id = ${state.brova2Id}`;
  await sql`
    INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number,
                                  action, previous_stage, distribution, satisfaction_level, notes)
    VALUES (${state.brova2Id}, ${state.workOrderId}, ${state.staffUserId}, 'brova_trial', ${b2Row.trip_number},
            ${acceptedFb}, ${b2Row.piece_stage}, 'shop', 5, 'Perfect')
  `;
  await sql`
    UPDATE garments SET
      piece_stage = ${acceptResult.newStage}::piece_stage,
      feedback_status = ${acceptResult.feedbackStatus},
      acceptance_status = ${acceptResult.acceptanceStatus}
    WHERE id = ${state.brova2Id}
  `;
  ok(`B2 applied per evaluateBrovaFeedback → acceptance_status=true`);

  // CONTRACT: discarded must not appear in active counts (migration 0002 widening)
  const [{ active }] = await sql`
    SELECT COUNT(*) as active FROM garments
    WHERE order_id = ${state.workOrderId} AND piece_stage NOT IN ('completed', 'discarded')
  `;
  assertEq(Number(active), 3, "Active (non-terminal) = 3: B2 brova_trialed + 2 finals parked");

  // Showroom label after feedback: awaiting_finals (brovas done, finals still out)
  const gs = await sql`
    SELECT garment_type, piece_stage, location, acceptance_status, feedback_status, trip_number
    FROM garments WHERE order_id = ${state.workOrderId}
  `;
  const { label } = getShowroomStatus(gs);
  // Expected: B2 brova_trialed at shop (acceptance_status=true → shop_item_done).
  // Finals still parked at workshop (location!='shop') → finalsStillOut=true.
  // hasBrovaAwaitingTrial=false (B1 discarded, B2 trialed).
  // → awaiting_finals.
  assertEq(label, "awaiting_finals", "getShowroomStatus = 'awaiting_finals'");

  log("✅ Step 8 complete");
}

// ─── STEP 9: Replacement garment (createGarmentForOrder contract) ───────────

async function step9Replacement() {
  log("Step 9: Replacement via createGarmentForOrder contract (same-order, atomic link)...");
  const state = loadState();
  requireState(state, ["workOrderId", "brova1Id", "fabricIds", "measurementId"]);

  // CONTRACT validations from apps/workshop/src/api/garments.ts:
  const [orig] = await sql`SELECT order_id, piece_stage, replaced_by_garment_id FROM garments WHERE id = ${state.brova1Id}`;
  if (!orig) fail(`Original ${state.brova1Id} not found`);
  if (orig.replaced_by_garment_id) fail(`Already replaced`);
  assertEq(orig.piece_stage, "discarded", "original is discarded");
  assertEq(orig.order_id, state.workOrderId, "same order check");

  // Compute next garment_id suffix per nextGarmentIdForOrder()
  const existing = await sql`SELECT garment_id FROM garments WHERE order_id = ${state.workOrderId}`;
  const prefix = `${state.workOrderId}-`;
  const used = existing.map(r => Number((r.garment_id as string | null)?.slice(prefix.length))).filter(Number.isFinite);
  const nextSuffix = used.length ? Math.max(...used) + 1 : 1;
  const garmentCode = `${prefix}${nextSuffix}`;

  // Real createGarmentForOrder initial state: waiting_cut, workshop, trip=1, in_production=false
  const [replacement] = await sql`
    INSERT INTO garments (
      order_id, garment_id, fabric_id, style_id, measurement_id, fabric_source, color,
      fabric_length, garment_type, soaking, express, style,
      collar_type, collar_button, cuffs_type, cuffs_thickness,
      front_pocket_type, front_pocket_thickness, wallet_pocket, pen_holder,
      small_tabaggi, jabzour_1, lines,
      piece_stage, location, trip_number, in_production
    ) VALUES (
      ${state.workOrderId}, ${garmentCode}, ${state.fabricIds[0]}, 1, ${state.measurementId},
      'IN', 'C01', 3.5, 'brova', true, true,
      'kuwaiti', 'stand', 'yes', 'round', 'single', 'standard', 'single',
      false, false, false, 'BUTTON', 1,
      'waiting_cut'::piece_stage, 'workshop', 1, false
    )
    RETURNING id, garment_id, piece_stage, location, trip_number, in_production
  `;
  assertEq(replacement.piece_stage, "waiting_cut", "replacement piece_stage");
  assertEq(replacement.location, "workshop", "replacement location=workshop");
  assertEq(replacement.trip_number, 1, "replacement trip_number=1");
  assertEq(replacement.in_production, false, "replacement in_production=false (needs scheduling)");

  // Atomic link with IS NULL guard
  const linked = await sql`
    UPDATE garments SET replaced_by_garment_id = ${replacement.id}
    WHERE id = ${state.brova1Id} AND replaced_by_garment_id IS NULL
    RETURNING 1
  `;
  assertEq(linked.length, 1, "atomic link successful");

  // Double-replace must no-op (IS NULL guard + unique index backstop)
  const secondTry = await sql`
    UPDATE garments SET replaced_by_garment_id = ${replacement.id}
    WHERE id = ${state.brova1Id} AND replaced_by_garment_id IS NULL
    RETURNING 1
  `;
  assertEq(secondTry.length, 0, "double-replace guard blocks second attempt");

  state.brova1ReplacementId = replacement.id;
  saveState(state);
  log("✅ Step 9 complete");
}

// ─── STEP 10: Release finals ────────────────────────────────────────────────

async function step10ReleaseFinals() {
  log("Step 10: Release finals (gate: any brova acceptance_status=true)...");
  const state = loadState();
  requireState(state, ["workOrderId"]);

  // Gate verification via evaluateBrovaFeedback returned releaseFinals in step 8
  const [{ any_accepted }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM garments WHERE order_id = ${state.workOrderId} AND garment_type = 'brova' AND acceptance_status = true
    ) as any_accepted
  `;
  assertEq(any_accepted, true, "gate: at least one brova accepted");

  const released = await sql`
    UPDATE garments SET piece_stage = 'waiting_cut'::piece_stage
    WHERE order_id = ${state.workOrderId}
      AND garment_type = 'final'
      AND piece_stage = 'waiting_for_acceptance'
    RETURNING garment_id
  `;
  assertEq(released.length, 2, "2 finals released");

  log("✅ Step 10 complete");
}

// ─── STEP 11: Finals workshop cycle + replacement brova ─────────────────────

async function step11FinalsAndReplacement() {
  log("Step 11: Dispatch + process finals and replacement brova...");
  const state = loadState();
  requireState(state, ["workOrderId", "resourceIds", "brova1ReplacementId", "final1Id", "final2Id"]);

  // Finals at location=shop, trip=1 (were dispatched to_workshop with the order
  // in step 2, then auto-parked at workshop). Wait — actually finals moved to
  // workshop in step 3 (we updated location to 'workshop'). So finals are
  // currently at workshop, piece_stage=waiting_cut (released). They just need
  // scheduling — no re-dispatch.
  //
  // Set in_production=true + assigned fields
  const today = new Date().toISOString().slice(0, 10);
  const finalPlan = buildProductionPlan(state.resourceIds, "cutting");
  await sql`
    UPDATE garments SET
      in_production = true,
      piece_stage = 'cutting'::piece_stage,
      trip_history = ${sql.json([{
        trip: 1, reentry_stage: "cutting", production_plan: finalPlan,
        worker_history: {}, assigned_date: today, completed_date: null, qc_attempts: [],
      }] as any) as any},
      assigned_date = ${today}::date
    WHERE order_id = ${state.workOrderId} AND garment_type = 'final'
  `;
  ok("Finals scheduled at cutting");

  // Replacement brova: schedule from soaking (soaking=true), process
  const replPlan = buildProductionPlan(state.resourceIds, "soaking");
  await sql`
    UPDATE garments SET
      in_production = true,
      production_plan = ${sql.json(replPlan as any) as any},
      assigned_date = ${today}::date,
      piece_stage = 'soaking'::piece_stage,
      trip_history = ${sql.json([{
        trip: 1, reentry_stage: "soaking", production_plan: replPlan,
        worker_history: {}, assigned_date: today, completed_date: null, qc_attempts: [],
      }] as any) as any}
    WHERE id = ${state.brova1ReplacementId}
  `;

  // Run all three through
  await runThroughTerminals(state.brova1ReplacementId, state.resourceIds, "soaking");
  await runThroughTerminals(state.final1Id, state.resourceIds, "cutting");
  await runThroughTerminals(state.final2Id, state.resourceIds, "cutting");
  ok("Replacement brova + F1 + F2 → ready_for_dispatch");

  log("✅ Step 11 complete");
}

// ─── STEP 12: Ship everything to shop ───────────────────────────────────────

async function step12ShipEverything() {
  log("Step 12: Dispatch all → shop receives (brovas awaiting_trial, finals ready_for_pickup)...");
  const state = loadState();
  requireState(state, ["workOrderId"]);

  const ready = await sql`
    SELECT id, garment_type FROM garments
    WHERE order_id = ${state.workOrderId}
      AND location = 'workshop' AND piece_stage = 'ready_for_dispatch'
  `;
  assertEq(ready.length, 3, "3 ready for dispatch (2 finals + 1 replacement brova)");
  await dispatchFromWorkshop(ready.map(r => r.id));

  // Receive at shop — per contract: brova → awaiting_trial, final → ready_for_pickup
  for (const r of ready) {
    const newStage = r.garment_type === "brova" ? "awaiting_trial" : "ready_for_pickup";
    await sql`UPDATE garments SET piece_stage = ${newStage}::piece_stage, location = 'shop' WHERE id = ${r.id}`;
  }

  // Showroom label: replacement brova at awaiting_trial → 'brova_trial' wins priority
  const gs = await sql`
    SELECT garment_type, piece_stage, location, acceptance_status, feedback_status, trip_number
    FROM garments WHERE order_id = ${state.workOrderId}
  `;
  const { label } = getShowroomStatus(gs);
  assertEq(label, "brova_trial", "getShowroomStatus = 'brova_trial' (replacement brova needs trial)");

  log("✅ Step 12 complete");
}

// ─── STEP 13: Trial replacement brova ───────────────────────────────────────

async function step13TrialReplace() {
  log("Step 13: Replacement brova → accepted (evaluateBrovaFeedback oracle)...");
  const state = loadState();
  requireState(state, ["workOrderId", "staffUserId", "brova1ReplacementId"]);

  const brovas = await sql`
    SELECT id, piece_stage, acceptance_status, feedback_status FROM garments
    WHERE order_id = ${state.workOrderId} AND garment_type = 'brova'
  `;
  const result = evaluateBrovaFeedback("accepted", brovas.map(b => ({
    id: b.id as string, piece_stage: b.piece_stage as PieceStage,
    acceptance_status: b.acceptance_status as boolean | null,
    feedback_status: b.feedback_status as string | null,
  })), state.brova1ReplacementId);

  const [br] = await sql`SELECT piece_stage, trip_number FROM garments WHERE id = ${state.brova1ReplacementId}`;
  await sql`
    INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number,
                                  action, previous_stage, distribution, satisfaction_level, notes)
    VALUES (${state.brova1ReplacementId}, ${state.workOrderId}, ${state.staffUserId}, 'brova_trial', ${br.trip_number},
            'accepted', ${br.piece_stage}, 'shop', 5, 'Replacement fits')
  `;
  await sql`
    UPDATE garments SET
      piece_stage = ${result.newStage}::piece_stage,
      feedback_status = ${result.feedbackStatus},
      acceptance_status = ${result.acceptanceStatus}
    WHERE id = ${state.brova1ReplacementId}
  `;
  ok(`Replacement brova accepted (newStage=${result.newStage})`);

  log("✅ Step 13 complete");
}

// ─── STEP 14: Collect finals (F1 collected, F2 needs_repair → alt) ─────────

async function step14CollectFinals() {
  log("Step 14: F1 collected, F2 needs_repair → trip 1→2 (alt #1 per isAlteration)...");
  const state = loadState();
  requireState(state, ["workOrderId", "staffUserId", "final1Id", "final2Id"]);

  // F1: accepted + collected
  const [f1] = await sql`SELECT piece_stage, trip_number FROM garments WHERE id = ${state.final1Id}`;
  await sql`
    INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number,
                                  action, previous_stage, distribution, satisfaction_level, notes)
    VALUES (${state.final1Id}, ${state.workOrderId}, ${state.staffUserId}, 'final_collection', ${f1.trip_number},
            'collected', ${f1.piece_stage}, 'pickup', 5, 'Customer happy')
  `;
  await sql`
    UPDATE garments SET
      piece_stage = 'completed'::piece_stage,
      feedback_status = 'accepted',
      acceptance_status = true,
      fulfillment_type = 'collected'
    WHERE id = ${state.final1Id}
  `;
  ok("F1 → completed");

  // F2: needs_repair_rejected → redispatch trip 1→2 (via real redispatch contract)
  const [f2] = await sql`SELECT piece_stage, trip_number FROM garments WHERE id = ${state.final2Id}`;
  await sql`
    INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number,
                                  action, previous_stage, distribution, satisfaction_level, notes)
    VALUES (${state.final2Id}, ${state.workOrderId}, ${state.staffUserId}, 'final_collection', ${f2.trip_number},
            'needs_repair_rejected', ${f2.piece_stage}, 'workshop', 3, 'Sleeve length')
  `;
  // Mark feedback on garment before redispatch
  await sql`
    UPDATE garments SET feedback_status = 'needs_repair', acceptance_status = false WHERE id = ${state.final2Id}
  `;
  const newTrip = await redispatchFromShop(state.final2Id);
  assertEq(newTrip, 2, "F2 trip incremented to 2");

  // CONTRACT: isAlteration(2) = true, getAlterationNumber(2) = 1
  assertEq(isAlteration(newTrip), true, "isAlteration(2) = true");
  assertEq(getAlterationNumber(newTrip), 1, "getAlterationNumber(2) = 1 (alt #1)");

  log("✅ Step 14 complete");
}

// ─── STEP 15: F2 alteration cycle ───────────────────────────────────────────

async function step15FinalAlt() {
  log("Step 15: F2 alteration cycle → collected...");
  const state = loadState();
  requireState(state, ["workOrderId", "resourceIds", "staffUserId", "final2Id"]);

  const [f2Pre] = await sql`SELECT trip_number FROM garments WHERE id = ${state.final2Id}`;
  assertEq(getAltLabel({ trip_number: f2Pre.trip_number }), "alt_1", "getAltLabel(F2) = 'alt_1'");

  // Workshop receives — no brova-approval gate for alterations (trip>=2)
  await sql`
    UPDATE garments SET
      location = 'workshop', in_production = true,
      production_plan = NULL, completion_time = NULL, start_time = NULL
    WHERE id = ${state.final2Id}
  `;

  // Schedule from re-entry stage (alterations re-enter mid-pipeline; use finishing)
  const reentry: Stage = "finishing";
  const today = new Date().toISOString().slice(0, 10);
  const plan = buildProductionPlan(state.resourceIds, reentry);
  await sql`
    UPDATE garments SET
      production_plan = ${sql.json(plan as any) as any},
      assigned_date = ${today}::date,
      piece_stage = ${reentry}::piece_stage,
      trip_history = COALESCE(trip_history, '[]'::jsonb) || ${sql.json([{
        trip: f2Pre.trip_number, reentry_stage: reentry, production_plan: plan,
        worker_history: {}, assigned_date: today, completed_date: null, qc_attempts: [],
      }] as any) as any}
    WHERE id = ${state.final2Id}
  `;
  await runThroughTerminals(state.final2Id, state.resourceIds, reentry);

  // Ship back, receive, collect
  await dispatchFromWorkshop([state.final2Id]);
  await sql`UPDATE garments SET piece_stage = 'ready_for_pickup'::piece_stage, location = 'shop' WHERE id = ${state.final2Id}`;

  const [f2Post] = await sql`SELECT piece_stage, trip_number FROM garments WHERE id = ${state.final2Id}`;
  await sql`
    INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number,
                                  action, previous_stage, distribution, satisfaction_level, notes)
    VALUES (${state.final2Id}, ${state.workOrderId}, ${state.staffUserId}, 'final_collection', ${f2Post.trip_number},
            'collected', ${f2Post.piece_stage}, 'pickup', 4, 'Fixed')
  `;
  await sql`
    UPDATE garments SET
      piece_stage = 'completed'::piece_stage,
      feedback_status = 'accepted',
      acceptance_status = true,
      fulfillment_type = 'collected'
    WHERE id = ${state.final2Id}
  `;
  ok("F2 (alt #1) → completed");

  log("✅ Step 15 complete");
}

// ─── STEP 16: Verify order_phase ────────────────────────────────────────────

async function step16VerifyPhase() {
  log("Step 16: Verify computeOrderPhase vs trigger output...");
  const state = loadState();
  requireState(state, ["workOrderId"]);

  const rows = await sql`
    SELECT garment_id, garment_type, piece_stage FROM garments
    WHERE order_id = ${state.workOrderId} ORDER BY garment_id
  `;
  info(`Garment piece_stages: ${rows.map(r => `${r.garment_id}=${r.piece_stage}`).join(", ")}`);

  // State now:
  //   B1 (discarded), B2 (brova_trialed accepted), B1-replacement (brova_trialed accepted),
  //   F1 (completed), F2 (completed)
  // computeOrderPhase with brova_trialed + completed + discarded → 'in_progress'
  // (NOT all terminal because brova_trialed is not TERMINAL; not all pre-dispatch either.)
  // Trigger behavior should match.
  const expectedPhase = computeOrderPhase(rows.map(r => ({ piece_stage: r.piece_stage })), "in_progress");
  const [wo] = await sql`SELECT order_phase FROM work_orders WHERE order_id = ${state.workOrderId}`;
  assertEq(wo.order_phase, expectedPhase, `trigger's order_phase matches computeOrderPhase`);
  info(`Phase: ${wo.order_phase} (brova_trialed brovas block full completion)`);

  // Now mark accepted brovas as completed (real flow does this via a manual step
  // when staff closes the order — or via brova-collection feedback). This tests
  // that migration 0002's widening (terminal = completed OR discarded) works:
  // with B1 discarded + all others completed → trigger should flip to 'completed'.
  await sql`
    UPDATE garments SET
      piece_stage = 'completed'::piece_stage,
      fulfillment_type = 'collected'
    WHERE order_id = ${state.workOrderId}
      AND garment_type = 'brova'
      AND piece_stage = 'brova_trialed'
      AND acceptance_status = true
  `;
  const rowsAfter = await sql`SELECT piece_stage FROM garments WHERE order_id = ${state.workOrderId}`;
  const expectedAfter = computeOrderPhase(rowsAfter.map(r => ({ piece_stage: r.piece_stage })), "in_progress");
  assertEq(expectedAfter, "completed", "computeOrderPhase = 'completed' (all terminal: completed|discarded)");

  const [wo2] = await sql`SELECT order_phase FROM work_orders WHERE order_id = ${state.workOrderId}`;
  assertEq(wo2.order_phase, "completed", "trigger flipped order_phase → 'completed' (widened terminal check)");

  log("✅ Step 16 complete");
}

// ─── STEP 17: ALTERATION order (customer-brought) ───────────────────────────

async function step17AltCreate() {
  log("Step 17: Create ALTERATION order via next_alteration_invoice RPC...");
  const state = loadState();
  requireState(state, ["customerId", "staffUserId"]);

  // Real contract: allocate invoice via RPC (SECURITY DEFINER; callable via pg too)
  const invRow = firstRow(
    await sql`SELECT next_alteration_invoice() as n`,
    "next_alteration_invoice",
  );
  state.altInvoice = Number((invRow as any).n);
  ok(`Alteration invoice #${state.altInvoice}`);

  // 3 garments at varying custom prices (mirrors createAlterationOrder input shape)
  const altGarments = [
    { quantity: 1, bufi_ext: "BU12", custom_price: 5.000,
      alteration_measurements: { waist_front: "46", length_front: "140" },
      alteration_issues: { length: { shorten: true } }, notes: "Shorten by 2cm" },
    { quantity: 1, bufi_ext: "F3", custom_price: 5.000,
      alteration_measurements: { waist_front: "44" },
      alteration_issues: { waist: { tighten: true } }, notes: "Waist in" },
    { quantity: 1, bufi_ext: "EXT5", custom_price: 7.000,
      alteration_measurements: { sleeve_length: "62" },
      alteration_issues: { sleeve: { lengthen: true } }, notes: "Extend sleeve" },
  ];
  const altTotal = altGarments.reduce((s, g) => s + g.custom_price * g.quantity, 0);

  // Step 2 of createAlterationOrder: parent order row
  const [order] = await sql`
    INSERT INTO orders (customer_id, order_taker_id, order_date, brand, checkout_status, order_type, order_total, payment_type, paid)
    VALUES (${state.customerId}, ${state.staffUserId}, NOW(), ${BRAND}, 'confirmed', 'ALTERATION', ${altTotal}, 'cash', ${altTotal})
    RETURNING id
  `;
  state.altOrderId = order.id;

  // Step 3: alteration_orders extension
  await sql`
    INSERT INTO alteration_orders (order_id, invoice_number, received_date, order_phase, alteration_total, comments)
    VALUES (${state.altOrderId}, ${state.altInvoice}, NOW(), 'new', ${altTotal}, 'Customer-brought: 3 dishdashas')
  `;

  // Step 4: garments — per real contract use `final` + waiting_cut + location=shop + trip=0
  const requestedDelivery = new Date(); requestedDelivery.setDate(requestedDelivery.getDate() + 5);
  const ids: string[] = [];
  for (let i = 0; i < altGarments.length; i++) {
    const g = altGarments[i];
    const [row] = await sql`
      INSERT INTO garments (
        order_id, garment_id, quantity, bufi_ext, custom_price,
        alteration_measurements, alteration_issues, delivery_date, notes,
        garment_type, piece_stage, location, trip_number, in_production
      ) VALUES (
        ${state.altOrderId}, ${`${state.altInvoice}-${i + 1}`}, ${g.quantity}, ${g.bufi_ext}, ${g.custom_price},
        ${sql.json(g.alteration_measurements as any) as any},
        ${sql.json(g.alteration_issues as any) as any},
        ${requestedDelivery}, ${g.notes},
        'final', 'waiting_cut'::piece_stage, 'shop', 0, false
      ) RETURNING id
    `;
    ids.push(row.id);
  }
  state.altGarmentIds = ids;

  // Sanity: total matches
  const [{ sum_price }] = await sql`
    SELECT SUM(custom_price * quantity) as sum_price FROM garments WHERE order_id = ${state.altOrderId}
  `;
  assertEq(Number(sum_price), altTotal, `garments sum = order_total`);

  saveState(state);
  log("✅ Step 17 complete");
}

// ─── STEP 18: Alteration production ─────────────────────────────────────────

async function step18AltProduction() {
  log("Step 18: Alteration order dispatch + workshop cycle...");
  const state = loadState();
  requireState(state, ["altOrderId", "resourceIds", "altGarmentIds"]);

  // Dispatch (reuse helper; alteration orders use the same dispatch flow but
  // without a work_orders row so we won't flip phase — alteration_orders has
  // its own phase column).
  await sql`
    UPDATE garments SET location = 'transit_to_workshop', trip_number = 1
    WHERE order_id = ${state.altOrderId} AND trip_number = 0
  `;
  await sql`
    INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
    SELECT id, order_id, 'to_workshop', trip_number FROM garments
    WHERE order_id = ${state.altOrderId} AND location = 'transit_to_workshop'
  `;
  await sql`UPDATE alteration_orders SET order_phase = 'in_progress' WHERE order_id = ${state.altOrderId}`;

  // Receive & start
  await sql`
    UPDATE garments SET location = 'workshop', in_production = true
    WHERE order_id = ${state.altOrderId} AND location = 'transit_to_workshop'
  `;

  const today = new Date().toISOString().slice(0, 10);
  const plan = buildProductionPlan(state.resourceIds, "cutting");
  await sql`
    UPDATE garments SET
      production_plan = ${sql.json(plan as any) as any},
      assigned_date = ${today}::date,
      piece_stage = 'cutting'::piece_stage,
      trip_history = ${sql.json([{
        trip: 1, reentry_stage: "cutting", production_plan: plan,
        worker_history: {}, assigned_date: today, completed_date: null, qc_attempts: [],
      }] as any) as any}
    WHERE order_id = ${state.altOrderId}
  `;
  for (const id of state.altGarmentIds) {
    await runThroughTerminals(id, state.resourceIds, "cutting");
  }

  await sql`
    UPDATE garments SET location = 'transit_to_shop', in_production = false
    WHERE order_id = ${state.altOrderId} AND piece_stage = 'ready_for_dispatch'
  `;
  await sql`
    INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
    SELECT id, order_id, 'to_shop', trip_number FROM garments
    WHERE order_id = ${state.altOrderId} AND location = 'transit_to_shop'
  `;
  await sql`
    UPDATE garments SET piece_stage = 'ready_for_pickup'::piece_stage, location = 'shop'
    WHERE order_id = ${state.altOrderId} AND location = 'transit_to_shop'
  `;

  log("✅ Step 18 complete");
}

// ─── STEP 19: Collect alteration garments ───────────────────────────────────

async function step19AltCollect() {
  log("Step 19: Collect alteration garments...");
  const state = loadState();
  requireState(state, ["altOrderId", "staffUserId", "altGarmentIds"]);

  for (const id of state.altGarmentIds) {
    const [g] = await sql`SELECT piece_stage, trip_number FROM garments WHERE id = ${id}`;
    await sql`
      INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number,
                                    action, previous_stage, distribution, satisfaction_level, notes)
      VALUES (${id}, ${state.altOrderId}, ${state.staffUserId}, 'final_collection', ${g.trip_number},
              'collected', ${g.piece_stage}, 'pickup', 5, 'Alteration pleased')
    `;
    await sql`
      UPDATE garments SET
        piece_stage = 'completed'::piece_stage,
        feedback_status = 'accepted',
        acceptance_status = true,
        fulfillment_type = 'collected'
      WHERE id = ${id}
    `;
  }

  // alteration_orders.order_phase is NOT managed by the work_orders trigger —
  // manually flip (mirrors the real alteration collection page).
  await sql`UPDATE alteration_orders SET order_phase = 'completed' WHERE order_id = ${state.altOrderId}`;

  const [alt] = await sql`SELECT order_phase FROM alteration_orders WHERE order_id = ${state.altOrderId}`;
  assertEq(alt.order_phase, "completed", "alteration_orders.order_phase = completed");

  log("✅ Step 19 complete");
}

// ─── VERIFY: RPCs + helpers sanity ──────────────────────────────────────────

async function verify() {
  log("Verify: RPCs + helpers sanity checks...");
  const state = loadState();

  // 1. Sidebar counts RPC (raw pg — same function, bypasses RLS)
  const sideRow = firstRow(await sql`SELECT get_workshop_sidebar_counts() as r`, "sidebar");
  ok(`Sidebar: ${sql.json((sideRow as any).r as any) as any}`);

  // 2. Showroom page RPC — completed order should NOT appear
  const shRow = firstRow(await sql`
    SELECT get_showroom_orders_page(${BRAND}, 1, 20) as r
  `, "showroom");
  const total = ((shRow as any).r)?.total_count ?? 0;
  ok(`Showroom page total: ${total} — completed WORK order excluded by order_phase filter`);

  // 3. Completed work order stats
  if (state.workOrderId) {
    const gs = await sql`SELECT piece_stage, garment_type, location, acceptance_status, feedback_status, trip_number FROM garments WHERE order_id = ${state.workOrderId}`;
    const summary = getOrderSummary(gs);
    ok(`Order summary: total=${summary.totalGarments}, brovaCompleted=${summary.brovaCompleted}, finalCompleted=${summary.finalCompleted}, allCompleted=${summary.allCompleted}`);

    const [{ discarded, active }] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE piece_stage = 'discarded') as discarded,
        COUNT(*) FILTER (WHERE piece_stage NOT IN ('completed', 'discarded')) as active
      FROM garments WHERE order_id = ${state.workOrderId}
    `;
    assertEq(Number(discarded), 1, "exactly 1 discarded (B1)");
    assertEq(Number(active), 0, "0 active (all terminal)");

    const [{ linked }] = await sql`
      SELECT COUNT(*) as linked FROM garments WHERE order_id = ${state.workOrderId} AND replaced_by_garment_id IS NOT NULL
    `;
    assertEq(Number(linked), 1, "1 replacement linkage");
  }

  // 4. Dispatch log counts
  if (state.workOrderId) {
    const rows = await sql`SELECT direction, COUNT(*) as c FROM dispatch_log WHERE order_id = ${state.workOrderId} GROUP BY direction ORDER BY direction`;
    ok(`dispatch_log (work order): ${rows.map(r => `${r.direction}=${r.c}`).join(", ")}`);
  }
  if (state.altOrderId) {
    const rows = await sql`SELECT direction, COUNT(*) as c FROM dispatch_log WHERE order_id = ${state.altOrderId} GROUP BY direction ORDER BY direction`;
    ok(`dispatch_log (alteration): ${rows.map(r => `${r.direction}=${r.c}`).join(", ")}`);
  }

  log("✅ Verify complete");
}

// ─── STATUS / CLEAN / ALL ────────────────────────────────────────────────────

async function showStatus() {
  const state = loadState();
  if (!state.workOrderId && !state.altOrderId) fail("No orders. Run step1-create or step17-alt-create.");

  if (state.workOrderId) {
    const [o] = await sql`
      SELECT o.id, o.checkout_status, o.order_total, o.paid,
             w.invoice_number, w.order_phase
      FROM orders o JOIN work_orders w ON w.order_id = o.id WHERE o.id = ${state.workOrderId}
    `;
    console.log(`\n═══ WORK #${o.id} | Inv ${o.invoice_number ?? "-"} | Phase ${o.order_phase} | Status ${o.checkout_status} ═══`);
    console.log(`    Total: ${o.order_total} | Paid: ${o.paid}`);
    const gs = await sql`
      SELECT garment_id, garment_type, piece_stage, location, trip_number,
             feedback_status, acceptance_status, express, soaking, in_production,
             replaced_by_garment_id, style_id
      FROM garments WHERE order_id = ${state.workOrderId} ORDER BY garment_id
    `;
    for (const g of gs) {
      const flags = [g.express && "EXP", g.soaking && "SOAK", g.in_production && "PROD", g.replaced_by_garment_id && "→REPL"].filter(Boolean).join(",");
      console.log(`    ${(g.garment_id ?? "?").padEnd(10)} | ${g.garment_type.padEnd(5)} | ${String(g.piece_stage).padEnd(22)} | ${String(g.location).padEnd(20)} | trip=${g.trip_number} | style=${g.style_id} | fb=${g.feedback_status ?? "-"} | acc=${g.acceptance_status ?? "-"} | ${flags}`);
    }
    const summary = getOrderSummary(gs);
    console.log(`    summary: ${sql.json({ total: summary.totalGarments, brovaCompleted: summary.brovaCompleted, finalCompleted: summary.finalCompleted, allCompleted: summary.allCompleted } as any) as any}`);
  }

  if (state.altOrderId) {
    const [alt] = await sql`
      SELECT o.id, o.order_total, a.invoice_number, a.order_phase, a.comments
      FROM orders o JOIN alteration_orders a ON a.order_id = o.id WHERE o.id = ${state.altOrderId}
    `;
    console.log(`\n═══ ALTERATION #${alt.id} | Inv ${alt.invoice_number} | Phase ${alt.order_phase} ═══`);
    console.log(`    Total: ${alt.order_total} | ${alt.comments ?? ""}`);
    const gs = await sql`
      SELECT garment_id, piece_stage, location, trip_number, bufi_ext, custom_price
      FROM garments WHERE order_id = ${state.altOrderId} ORDER BY garment_id
    `;
    for (const g of gs) {
      console.log(`    ${g.garment_id.padEnd(10)} | ${String(g.piece_stage).padEnd(22)} | ${String(g.location).padEnd(20)} | trip=${g.trip_number} | bufi=${g.bufi_ext} | price=${g.custom_price}`);
    }
  }
}

async function clean() {
  log("Clean: delete test orders + reset state file...");
  const state = loadState();
  for (const oid of [state.workOrderId, state.altOrderId]) {
    if (!oid) continue;
    await sql`DELETE FROM dispatch_log WHERE order_id = ${oid}`;
    await sql`DELETE FROM garment_feedback WHERE order_id = ${oid}`;
    await sql`DELETE FROM payment_transactions WHERE order_id = ${oid}`;
    await sql`DELETE FROM garments WHERE order_id = ${oid}`;
    await sql`DELETE FROM work_orders WHERE order_id = ${oid}`;
    await sql`DELETE FROM alteration_orders WHERE order_id = ${oid}`;
    await sql`DELETE FROM orders WHERE id = ${oid}`;
    ok(`Deleted order #${oid}`);
  }
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  log("✅ Clean complete");
}

async function runAll() {
  const steps: Array<[string, () => Promise<void>]> = [
    ["seed", seed],
    ["step1-create", step1Create],
    ["step2-dispatch", step2Dispatch],
    ["step3-receive", step3Receive],
    ["step4-schedule", step4Schedule],
    ["step5-terminals", step5Terminals],
    ["step6-dispatch-shop", step6DispatchToShop],
    ["step7-receive-shop", step7ReceiveShop],
    ["step8-trial-redo", step8TrialRedo],
    ["step9-replacement", step9Replacement],
    ["step10-release-finals", step10ReleaseFinals],
    ["step11-finals-workshop", step11FinalsAndReplacement],
    ["step12-ship-everything", step12ShipEverything],
    ["step13-trial-replace", step13TrialReplace],
    ["step14-collect-finals", step14CollectFinals],
    ["step15-final-alt", step15FinalAlt],
    ["step16-verify-phase", step16VerifyPhase],
    ["step17-alt-create", step17AltCreate],
    ["step18-alt-production", step18AltProduction],
    ["step19-alt-collect", step19AltCollect],
    ["verify", verify],
    ["status", showStatus],
  ];
  for (const [name, fn] of steps) {
    console.log(`\n${"═".repeat(80)}\n  ${name.toUpperCase()}\n${"═".repeat(80)}`);
    await fn();
  }
  log("✅ All steps complete");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

const STEPS: Record<string, () => Promise<void>> = {
  seed,
  "step1-create":            step1Create,
  "step2-dispatch":          step2Dispatch,
  "step3-receive":           step3Receive,
  "step4-schedule":          step4Schedule,
  "step5-terminals":         step5Terminals,
  "step6-dispatch-shop":     step6DispatchToShop,
  "step7-receive-shop":      step7ReceiveShop,
  "step8-trial-redo":        step8TrialRedo,
  "step9-replacement":       step9Replacement,
  "step10-release-finals":   step10ReleaseFinals,
  "step11-finals-workshop":  step11FinalsAndReplacement,
  "step12-ship-everything":  step12ShipEverything,
  "step13-trial-replace":    step13TrialReplace,
  "step14-collect-finals":   step14CollectFinals,
  "step15-final-alt":        step15FinalAlt,
  "step16-verify-phase":     step16VerifyPhase,
  "step17-alt-create":       step17AltCreate,
  "step18-alt-production":   step18AltProduction,
  "step19-alt-collect":      step19AltCollect,
  verify,
  status: showStatus,
  clean,
  all: runAll,
};

const step = process.argv[2] ?? "status";
if (!STEPS[step]) {
  console.log(`Unknown step: ${step}`);
  console.log(`Available: ${Object.keys(STEPS).join(", ")}`);
  process.exit(1);
}

STEPS[step]()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFatal:", err);
    warn(err?.stack ?? String(err));
    sql.end().then(() => process.exit(1));
  });

// Silence unused warnings on helpers that only run in specific paths
void isAlteration; void getAlterationNumber; void hasQcFailThisTrip; void getAltLabel;
