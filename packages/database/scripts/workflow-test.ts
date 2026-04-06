/**
 * End-to-end workflow test for the ERTH order cycle.
 * Uses raw postgres for writes (bypasses RLS) and Supabase RPCs where needed.
 *
 * Usage: packages/database/node_modules/.bin/tsx packages/database/scripts/workflow-test.ts [step]
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });
const SUPABASE_URL = "https://yuflzcpqiamilalqwkgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Aj-aSfmcR1WgNn4ONOK8Sw_jQzF8uz6";
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BRAND = "ERTH";

// State file to persist IDs between steps
const STATE_FILE = path.join(__dirname, ".workflow-state.json");

interface WorkflowState {
  customerId?: number;
  measurementId?: string;
  orderId?: number;
  invoiceNumber?: number;
  staffUserId?: string;
  fabricIds?: number[];
  styleId?: number;
  garmentIds?: string[];
  resourceIds?: string[];
}

function loadState(): WorkflowState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  }
  return {};
}

function saveState(state: WorkflowState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function log(msg: string) { console.log(`\n→ ${msg}`); }
function ok(msg: string) { console.log(`  ✓ ${msg}`); }
function info(msg: string) { console.log(`  ℹ ${msg}`); }
function fail(msg: string): never { console.error(`  ✗ FAIL: ${msg}`); process.exit(1); }

// ─── SEED ────────────────────────────────────────────────────────────────────

async function seed() {
  log("Seeding prerequisite data for ERTH workflow test...");
  const state = loadState();

  // 1. Find existing staff user
  log("Finding existing staff user...");
  const users = await sql`SELECT id, name, username, department, role FROM users WHERE is_active = true LIMIT 5`;
  if (!users.length) fail("No active users found");

  const shopUser = users.find(u => u.department === "shop") || users[0];
  state.staffUserId = shopUser.id;
  ok(`Staff user: ${shopUser.name} (${shopUser.username}, ${shopUser.department})`);

  // 2. Create test customer
  log("Creating test customer...");
  const [customer] = await sql`
    INSERT INTO customers (name, phone, nick_name, country_code, city, block, street, house_no, area, nationality, account_type)
    VALUES ('Workflow Test Customer', '55501234', 'WF Test', '+965', 'Kuwait City', '3', 'Test Street', '42', 'Salmiya', 'Kuwaiti', 'Primary')
    RETURNING id, name
  `;
  state.customerId = customer.id;
  ok(`Customer: id=${customer.id}, name=${customer.name}`);

  // 3. Create fabrics
  log("Creating test fabrics...");
  const ts = Date.now();
  const fabrics = await sql`
    INSERT INTO fabrics (name, color, color_hex, shop_stock, workshop_stock, price_per_meter) VALUES
      (${'WF-White-' + ts}, 'C01', '#FFFFFF', 100, 50, 3.500),
      (${'WF-Navy-' + ts}, 'C15', '#001F3F', 80, 40, 4.000)
    RETURNING id, name, price_per_meter
  `;
  state.fabricIds = fabrics.map(f => f.id);
  fabrics.forEach(f => ok(`Fabric: id=${f.id}, ${f.name}, ${f.price_per_meter}/m`));

  // 4. Find/create style
  log("Finding or creating style for ERTH...");
  const existingStyles = await sql`SELECT id, name FROM styles WHERE brand = ${BRAND} LIMIT 1`;
  if (existingStyles.length) {
    state.styleId = existingStyles[0].id;
    ok(`Existing style: id=${existingStyles[0].id}, ${existingStyles[0].name}`);
  } else {
    const [style] = await sql`
      INSERT INTO styles (name, type, rate_per_item, brand)
      VALUES ('kuwaiti', 'standard', 0, ${BRAND})
      RETURNING id, name
    `;
    state.styleId = style.id;
    ok(`Created style: id=${style.id}, ${style.name}`);
  }

  // 5. Ensure prices
  log("Ensuring prices for ERTH...");
  const prices = [
    { key: "STITCHING_ADULT", value: 9, desc: "Adult stitching rate" },
    { key: "STITCHING_CHILD", value: 7, desc: "Child stitching rate" },
    { key: "EXPRESS_SURCHARGE", value: 3, desc: "Express surcharge" },
    { key: "SOAKING_CHARGE", value: 1.5, desc: "Soaking charge" },
    { key: "HOME_DELIVERY", value: 2, desc: "Home delivery" },
  ];
  for (const p of prices) {
    await sql`
      INSERT INTO prices (key, brand, value, description)
      VALUES (${p.key}, ${BRAND}, ${p.value}, ${p.desc})
      ON CONFLICT (key, brand) DO UPDATE SET value = ${p.value}
    `;
    ok(`Price: ${p.key} = ${p.value}`);
  }

  // 6. Ensure workshop resources
  log("Ensuring workshop resources...");
  const responsibilities = ["cutter", "post_cutter", "sewer", "finisher", "ironer", "quality_checker", "soaker"];
  const resourceIds: string[] = [];
  for (const resp of responsibilities) {
    const existing = await sql`SELECT id, resource_name FROM resources WHERE brand = ${BRAND} AND responsibility = ${resp} LIMIT 1`;
    if (existing.length) {
      resourceIds.push(existing[0].id);
      ok(`Resource: ${resp} → ${existing[0].resource_name}`);
    } else {
      const name = `WF-${resp.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`;
      const [res] = await sql`
        INSERT INTO resources (brand, responsibility, resource_name, daily_target, unit)
        VALUES (${BRAND}, ${resp}, ${name}, 20, 'Unit-1')
        RETURNING id
      `;
      resourceIds.push(res.id);
      ok(`Created resource: ${resp} → ${name}`);
    }
  }
  state.resourceIds = resourceIds;

  // 7. Create measurement
  log("Creating measurement...");
  const [meas] = await sql`
    INSERT INTO measurements (customer_id, measurer_id, measurement_date, type,
      collar_width, collar_height, shoulder, armhole, chest_upper, chest_full,
      sleeve_length, sleeve_width, elbow, waist_front, waist_back, waist_full,
      length_front, length_back, bottom, notes)
    VALUES (${state.customerId}, ${state.staffUserId}, NOW(), 'Body',
      17.5, 4.0, 47.0, 24.0, 52.0, 54.0,
      62.0, 18.0, 20.0, 46.0, 48.0, 94.0,
      140.0, 142.0, 56.0, 'Workflow test measurement')
    RETURNING id
  `;
  state.measurementId = meas.id;
  ok(`Measurement: id=${meas.id}`);

  saveState(state);
  log("✅ Seed complete!");
  console.log("\nState:", JSON.stringify(state, null, 2));
}

// ─── STEP 1: Create Work Order ──────────────────────────────────────────────

async function step1() {
  log("Step 1: Creating work order with 2 brovas + 2 finals...");
  const state = loadState();
  if (!state.customerId || !state.staffUserId || !state.fabricIds || !state.measurementId) {
    fail("Missing seed data. Run 'seed' first.");
  }

  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 14);
  const expressDeliveryDate = new Date();
  expressDeliveryDate.setDate(expressDeliveryDate.getDate() + 7);

  // 1. Create order + work_orders
  log("Creating order...");
  const [order] = await sql`
    INSERT INTO orders (customer_id, order_taker_id, order_date, brand, checkout_status, order_type)
    VALUES (${state.customerId}, ${state.staffUserId}, NOW(), ${BRAND}, 'draft', 'WORK')
    RETURNING id
  `;
  state.orderId = order.id;

  await sql`
    INSERT INTO work_orders (order_id, order_phase, delivery_date, home_delivery)
    VALUES (${state.orderId}, 'new', ${deliveryDate}, false)
  `;
  ok(`Order #${state.orderId} created (draft)`);

  // 2. Insert garments directly
  log("Creating garments...");
  const garments = await sql`
    INSERT INTO garments (
      order_id, garment_id, fabric_id, style_id, measurement_id, fabric_source, color,
      fabric_length, garment_type, soaking, express, delivery_date, style,
      collar_type, collar_button, cuffs_type, cuffs_thickness,
      front_pocket_type, front_pocket_thickness, wallet_pocket, pen_holder,
      small_tabaggi, jabzour_1, lines, piece_stage, location, trip_number,
      fabric_price_snapshot, stitching_price_snapshot, style_price_snapshot
    ) VALUES
      -- Brova 1: White, soaking, EXPRESS, 7-day delivery
      (${state.orderId}, ${state.orderId + '-1'}, ${state.fabricIds![0]}, ${state.styleId}, ${state.measurementId},
       'IN', 'C01', 3.5, 'brova', true, true, ${expressDeliveryDate},
       'kuwaiti', 'stand', 'yes', 'round', 'single', 'standard', 'single',
       false, false, false, 'BUTTON', 1,
       'waiting_cut', 'shop', 0, 12.250, 9, 0),
      -- Brova 2: Navy, soaking, normal, 14-day delivery
      (${state.orderId}, ${state.orderId + '-2'}, ${state.fabricIds![1]}, ${state.styleId}, ${state.measurementId},
       'IN', 'C15', 3.5, 'brova', true, false, ${deliveryDate},
       'kuwaiti', 'band', 'no', 'square', 'double', 'curved', 'single',
       true, true, false, 'ZIPPER', 2,
       'waiting_cut', 'shop', 0, 14.000, 9, 0),
      -- Final 1: White, EXPRESS, waiting_for_acceptance
      (${state.orderId}, ${state.orderId + '-3'}, ${state.fabricIds![0]}, ${state.styleId}, ${state.measurementId},
       'IN', 'C01', 3.5, 'final', false, true, ${expressDeliveryDate},
       'kuwaiti', 'stand', 'yes', 'round', 'single', 'standard', 'single',
       false, false, false, 'BUTTON', 1,
       'waiting_for_acceptance', 'shop', 0, 12.250, 9, 0),
      -- Final 2: Navy, normal, waiting_for_acceptance
      (${state.orderId}, ${state.orderId + '-4'}, ${state.fabricIds![1]}, ${state.styleId}, ${state.measurementId},
       'IN', 'C15', 3.5, 'final', false, false, ${deliveryDate},
       'kuwaiti', 'band', 'no', 'square', 'double', 'curved', 'single',
       true, true, false, 'ZIPPER', 2,
       'waiting_for_acceptance', 'shop', 0, 14.000, 9, 0)
    RETURNING id, garment_id, garment_type, piece_stage, express, soaking, delivery_date
  `;

  state.garmentIds = garments.map(g => g.id);
  for (const g of garments) {
    ok(`${g.garment_id} | ${g.garment_type} | ${g.piece_stage} | express=${g.express} | soaking=${g.soaking} | delivery=${g.delivery_date?.toISOString().slice(0, 10)}`);
  }

  // 3. Update order charges and confirm
  log("Confirming order...");
  const fabricCharge = 12.250 + 14.000 + 12.250 + 14.000; // sum of fabric snapshots
  const stitchingCharge = 4 * 9;
  const expressCharge = 2 * 3; // 2 express garments
  const soakingCharge = 2 * 1.5; // 2 soaking garments
  const orderTotal = fabricCharge + stitchingCharge + expressCharge + soakingCharge;

  await sql`
    UPDATE orders SET
      checkout_status = 'confirmed',
      order_total = ${orderTotal},
      paid = 0,
      payment_type = 'cash',
      express_charge = ${expressCharge},
      soaking_charge = ${soakingCharge}
    WHERE id = ${state.orderId}
  `;

  // Generate invoice number
  const [maxInv] = await sql`SELECT COALESCE(MAX(invoice_number), 1000) + 1 as next_inv FROM work_orders WHERE invoice_number IS NOT NULL`;
  state.invoiceNumber = maxInv.next_inv;

  await sql`
    UPDATE work_orders SET
      invoice_number = ${state.invoiceNumber},
      fabric_charge = ${fabricCharge},
      stitching_charge = ${stitchingCharge},
      style_charge = 0,
      stitching_price = 9,
      num_of_fabrics = 4,
      advance = 0
    WHERE order_id = ${state.orderId}
  `;

  ok(`Order confirmed! Invoice: ${state.invoiceNumber}`);
  ok(`Total: ${orderTotal} KWD (fabric=${fabricCharge}, stitch=${stitchingCharge}, express=${expressCharge}, soak=${soakingCharge})`);
  ok(`Paid: 0 KWD (cashier handles payment for ERTH)`);

  saveState(state);
  log("✅ Step 1 complete!");
}

// ─── STATUS ──────────────────────────────────────────────────────────────────

async function showStatus() {
  const state = loadState();
  if (!state.orderId) fail("No order found. Run step1 first.");

  const [order] = await sql`
    SELECT o.id, o.checkout_status, o.order_total, o.paid,
           w.invoice_number, w.order_phase, w.delivery_date
    FROM orders o
    JOIN work_orders w ON w.order_id = o.id
    WHERE o.id = ${state.orderId}
  `;

  const garments = await sql`
    SELECT id, garment_id, garment_type, piece_stage, location,
           feedback_status, acceptance_status, trip_number,
           express, soaking, in_production, assigned_date, delivery_date
    FROM garments
    WHERE order_id = ${state.orderId}
    ORDER BY garment_id
  `;

  console.log("\n╔════════════════════════════════════════════════════════════════════════════════════════════╗");
  console.log(`║  Order #${order.id} | Invoice: ${order.invoice_number || "N/A"} | Phase: ${order.order_phase} | Status: ${order.checkout_status}`);
  console.log(`║  Total: ${order.order_total} KWD | Paid: ${order.paid} KWD | Balance: ${Number(order.order_total) - Number(order.paid)} KWD`);
  console.log("╠════════════════════════════════════════════════════════════════════════════════════════════╣");
  console.log("║  ID         │ Type   │ Stage                  │ Location            │ Trip │ Feedback       │ Accepted │ Expr │ Soak │ InProd");
  console.log("╠════════════════════════════════════════════════════════════════════════════════════════════╣");

  for (const g of garments) {
    const id = (g.garment_id || "?").padEnd(11);
    const type = g.garment_type.padEnd(6);
    const stage = (g.piece_stage || "null").padEnd(22);
    const loc = (g.location || "null").padEnd(19);
    const trip = String(g.trip_number).padEnd(4);
    const fb = (g.feedback_status || "-").padEnd(14);
    const acc = (g.acceptance_status === null ? "-" : String(g.acceptance_status)).padEnd(8);
    const exp = g.express ? "YES" : "-  ";
    const soak = g.soaking ? "YES" : "-  ";
    const prod = g.in_production ? "YES" : "-  ";
    console.log(`║  ${id} │ ${type} │ ${stage} │ ${loc} │ ${trip} │ ${fb} │ ${acc} │ ${exp}  │ ${soak}  │ ${prod}`);
  }
  console.log("╚════════════════════════════════════════════════════════════════════════════════════════════╝");
}

// ─── STEP 2: Dispatch to Workshop ───────────────────────────────────────────

async function step2() {
  log("Step 2: Dispatching order to workshop...");
  const state = loadState();
  if (!state.orderId) fail("No order. Run step1 first.");

  // This mimics dispatchOrder() in api/orders.ts:
  // 1. Update work_orders.order_phase → in_progress
  // 2. Update ALL garments → location: transit_to_workshop

  log("Checking dispatch page query: order_phase='new', checkout_status='confirmed'...");
  const orders = await sql`
    SELECT o.id, w.order_phase, o.checkout_status
    FROM orders o JOIN work_orders w ON w.order_id = o.id
    WHERE o.id = ${state.orderId}
  `;
  ok(`Order #${orders[0].id}: phase=${orders[0].order_phase}, status=${orders[0].checkout_status}`);

  if (orders[0].order_phase === "completed") fail(`Order already completed`);
  if (orders[0].checkout_status !== "confirmed") fail(`Expected checkout_status='confirmed', got '${orders[0].checkout_status}'`);

  // Dispatch all garments
  log("Dispatching all 4 garments to workshop...");
  await sql`UPDATE work_orders SET order_phase = 'in_progress' WHERE order_id = ${state.orderId}`;
  const updated = await sql`
    UPDATE garments SET location = 'transit_to_workshop'
    WHERE order_id = ${state.orderId}
    RETURNING garment_id, garment_type, piece_stage, location
  `;

  for (const g of updated) {
    ok(`${g.garment_id} | ${g.garment_type} | ${g.piece_stage} | → ${g.location}`);
  }

  // Verify: finals should still be waiting_for_acceptance, brovas at waiting_cut
  const brovas = updated.filter((g: any) => g.garment_type === "brova");
  const finals = updated.filter((g: any) => g.garment_type === "final");

  for (const b of brovas) {
    if (b.piece_stage !== "waiting_cut") fail(`Brova ${b.garment_id} should be waiting_cut, got ${b.piece_stage}`);
  }
  for (const f of finals) {
    if (f.piece_stage !== "waiting_for_acceptance") fail(`Final ${f.garment_id} should be waiting_for_acceptance, got ${f.piece_stage}`);
  }

  ok("Brovas: waiting_cut ✓ | Finals: waiting_for_acceptance (parked) ✓");
  log("✅ Step 2 complete! All garments in transit to workshop.");
}

// ─── STEP 3: Workshop Receives ──────────────────────────────────────────────

async function step3() {
  log("Step 3: Workshop receives garments...");
  const state = loadState();
  if (!state.orderId) fail("No order. Run step2 first.");

  // Workshop receiving page query: location='transit_to_workshop', trip_number-based tabs
  // Incoming tab: trip_number = 1
  log("Checking receiving page — Incoming tab (trip=1, location=transit_to_workshop)...");
  const incoming = await sql`
    SELECT id, garment_id, garment_type, piece_stage, location, trip_number
    FROM garments
    WHERE order_id = ${state.orderId}
      AND location = 'transit_to_workshop'
      AND (trip_number = 1 OR trip_number IS NULL)
    ORDER BY garment_id
  `;
  ok(`Found ${incoming.length} garments in Incoming tab`);
  for (const g of incoming) {
    ok(`  ${g.garment_id} | ${g.garment_type} | ${g.piece_stage}`);
  }

  // Receive & Start all (mimics receiveAndStartGarments)
  log("Receiving & Starting all garments...");
  const allIds = incoming.map((g: any) => g.id);

  // 1. Set location = workshop
  await sql`UPDATE garments SET location = 'workshop' WHERE id = ANY(${allIds})`;

  // 2. Set in_production = true for brovas (NOT finals at waiting_for_acceptance)
  await sql`
    UPDATE garments SET in_production = true
    WHERE id = ANY(${allIds})
      AND piece_stage != 'waiting_for_acceptance'
  `;

  // 3. Finals stay in_production = false (parked)
  const result = await sql`
    SELECT garment_id, garment_type, piece_stage, location, in_production
    FROM garments WHERE order_id = ${state.orderId} ORDER BY garment_id
  `;

  for (const g of result) {
    const expected_prod = g.garment_type === "brova" ? true : false;
    if (g.in_production !== expected_prod) {
      fail(`${g.garment_id}: expected in_production=${expected_prod}, got ${g.in_production}`);
    }
    ok(`${g.garment_id} | ${g.garment_type} | ${g.piece_stage} | loc=${g.location} | in_prod=${g.in_production}`);
  }

  log("✅ Step 3 complete! Brovas ready for scheduling, finals parked.");
}

// ─── STEP 4: Schedule Brovas ────────────────────────────────────────────────

async function step4() {
  log("Step 4: Scheduling brovas in workshop (NOT finals)...");
  const state = loadState();
  if (!state.orderId || !state.resourceIds) fail("Missing state. Run previous steps first.");

  // Scheduler page — Orders tab query:
  // location='workshop', in_production=true, piece_stage='waiting_cut', no production_plan
  log("Checking scheduler query for brovas...");
  const schedulable = await sql`
    SELECT id, garment_id, garment_type, piece_stage, in_production, soaking
    FROM garments
    WHERE order_id = ${state.orderId}
      AND location = 'workshop'
      AND in_production = true
      AND piece_stage = 'waiting_cut'
      AND production_plan IS NULL
    ORDER BY garment_id
  `;

  ok(`Found ${schedulable.length} garments ready for scheduling`);
  if (schedulable.length !== 2) fail(`Expected 2 brovas, got ${schedulable.length}`);

  // Verify only brovas appear (finals should NOT be in_production)
  for (const g of schedulable) {
    if (g.garment_type !== "brova") fail(`Unexpected ${g.garment_type} in scheduler!`);
    ok(`  ${g.garment_id} | ${g.garment_type} | soaking=${g.soaking}`);
  }

  // Resource IDs from seed: [cutter, post_cutter, sewer, finisher, ironer, quality_checker, soaker]
  const [cutterId, postCutterId, sewerId, finisherId, ironerId, qcId, soakerId] = state.resourceIds!;

  const productionPlan = {
    soaker: soakerId,
    cutter: cutterId,
    post_cutter: postCutterId,
    sewer: sewerId,
    finisher: finisherId,
    ironer: ironerId,
    quality_checker: qcId,
  };

  const today = new Date().toISOString().slice(0, 10);

  log("Assigning production plan to brovas...");
  // Both brovas have soaking=true, so start at soaking stage
  for (const g of schedulable) {
    const startStage = g.soaking ? "soaking" : "cutting";
    await sql`
      UPDATE garments SET
        production_plan = ${JSON.stringify(productionPlan)}::jsonb,
        assigned_date = ${today},
        piece_stage = ${startStage},
        trip_history = ${JSON.stringify([{
          trip_number: 1,
          reentry_stage: startStage,
          production_plan: productionPlan,
          assigned_date: today,
        }])}::jsonb
      WHERE id = ${g.id}
    `;
    ok(`${g.garment_id} → ${startStage}, plan assigned, date=${today}`);
  }

  // Also assign production_plan to finals (they're parked but get the plan for later)
  log("Assigning plan to parked finals (for when they're released)...");
  await sql`
    UPDATE garments SET
      production_plan = ${JSON.stringify(productionPlan)}::jsonb
    WHERE order_id = ${state.orderId}
      AND garment_type = 'final'
      AND piece_stage = 'waiting_for_acceptance'
  `;
  ok("Finals have production plan (still parked at waiting_for_acceptance)");

  log("✅ Step 4 complete! Brovas scheduled, starting at soaking.");
}

// ─── STEP 5: Process Through Terminal Stages ────────────────────────────────

async function step5() {
  log("Step 5: Processing brovas through all terminal stages...");
  const state = loadState();
  if (!state.orderId || !state.resourceIds) fail("Missing state.");

  const [cutterId, postCutterId, sewerId, finisherId, ironerId, qcId, soakerId] = state.resourceIds!;

  // Get brova IDs
  const brovas = await sql`
    SELECT id, garment_id, piece_stage, soaking
    FROM garments
    WHERE order_id = ${state.orderId} AND garment_type = 'brova'
    ORDER BY garment_id
  `;

  // The stage progression: soaking → cutting → post_cutting → sewing → finishing → ironing → quality_check → ready_for_dispatch
  const stages = [
    { from: "soaking", to: "cutting", workerKey: "soaker", workerId: soakerId },
    { from: "cutting", to: "post_cutting", workerKey: "cutter", workerId: cutterId },
    { from: "post_cutting", to: "sewing", workerKey: "post_cutter", workerId: postCutterId },
    { from: "sewing", to: "finishing", workerKey: "sewer", workerId: sewerId },
    { from: "finishing", to: "ironing", workerKey: "finisher", workerId: finisherId },
    { from: "ironing", to: "quality_check", workerKey: "ironer", workerId: ironerId },
    { from: "quality_check", to: "ready_for_dispatch", workerKey: "quality_checker", workerId: qcId },
  ];

  for (const brova of brovas) {
    log(`Processing ${brova.garment_id} (starting at ${brova.piece_stage})...`);
    let currentStage = brova.piece_stage;

    for (const stage of stages) {
      if (currentStage !== stage.from) continue;

      // Terminal action: start → complete → advance to next stage
      const now = new Date().toISOString();
      await sql`
        UPDATE garments SET
          piece_stage = ${stage.to},
          start_time = NULL,
          completion_time = ${now}::timestamptz,
          worker_history = COALESCE(worker_history, '{}'::jsonb) || ${JSON.stringify({ [stage.workerKey]: stage.workerId })}::jsonb
        WHERE id = ${brova.id}
      `;
      currentStage = stage.to;
      ok(`  ${stage.from} → ${stage.to}`);
    }
  }

  // Verify all brovas are at ready_for_dispatch
  const after = await sql`
    SELECT garment_id, piece_stage, location FROM garments
    WHERE order_id = ${state.orderId} AND garment_type = 'brova'
  `;
  for (const g of after) {
    if (g.piece_stage !== "ready_for_dispatch") fail(`${g.garment_id} should be ready_for_dispatch, got ${g.piece_stage}`);
  }
  ok("All brovas at ready_for_dispatch");

  // Verify finals are still parked
  const finals = await sql`
    SELECT garment_id, piece_stage, in_production FROM garments
    WHERE order_id = ${state.orderId} AND garment_type = 'final'
  `;
  for (const f of finals) {
    if (f.piece_stage !== "waiting_for_acceptance") fail(`Final ${f.garment_id} should still be parked!`);
    ok(`Final ${f.garment_id}: still parked at ${f.piece_stage}, in_prod=${f.in_production}`);
  }

  log("✅ Step 5 complete! Brovas ready for dispatch, finals still parked.");
}

// ─── STEP 6: Workshop Dispatches Brovas to Shop ─────────────────────────────

async function step6() {
  log("Step 6: Workshop dispatches brovas to shop...");
  const state = loadState();
  if (!state.orderId) fail("Missing state.");

  // Workshop dispatch page query: location='workshop', piece_stage IN (ready_for_dispatch, brova_trialed)
  log("Checking dispatch page query...");
  const ready = await sql`
    SELECT id, garment_id, garment_type, piece_stage
    FROM garments
    WHERE order_id = ${state.orderId}
      AND location = 'workshop'
      AND piece_stage IN ('ready_for_dispatch', 'brova_trialed')
    ORDER BY garment_id
  `;
  ok(`Found ${ready.length} garments ready for dispatch`);
  for (const g of ready) {
    ok(`  ${g.garment_id} | ${g.garment_type} | ${g.piece_stage}`);
  }

  // Dispatch: set location=transit_to_shop, in_production=false, feedback_status=null
  log("Dispatching brovas...");
  const brovaIds = ready.filter((g: any) => g.garment_type === "brova").map((g: any) => g.id);

  await sql`
    UPDATE garments SET
      location = 'transit_to_shop',
      in_production = false,
      feedback_status = NULL
    WHERE id = ANY(${brovaIds})
  `;

  const dispatched = await sql`
    SELECT garment_id, piece_stage, location FROM garments WHERE id = ANY(${brovaIds})
  `;
  for (const g of dispatched) {
    ok(`${g.garment_id} → ${g.location} (stage: ${g.piece_stage})`);
  }

  log("✅ Step 6 complete! Brovas dispatched to shop.");
}

// ─── STEP 7: Shop Receives Brovas ───────────────────────────────────────────

async function step7() {
  log("Step 7: Shop receives brovas (awaiting_trial)...");
  const state = loadState();
  if (!state.orderId) fail("Missing state.");

  // POS receiving page query: location=transit_to_shop
  log("Checking POS receiving page query...");
  const inTransit = await sql`
    SELECT id, garment_id, garment_type, piece_stage, location
    FROM garments
    WHERE order_id = ${state.orderId} AND location = 'transit_to_shop'
    ORDER BY garment_id
  `;
  ok(`Found ${inTransit.length} garments in transit to shop`);

  // Receive: brovas → awaiting_trial, finals → ready_for_pickup
  log("Receiving brovas at shop...");
  for (const g of inTransit) {
    const newStage = g.garment_type === "brova" ? "awaiting_trial" : "ready_for_pickup";
    await sql`
      UPDATE garments SET
        piece_stage = ${newStage},
        location = 'shop'
      WHERE id = ${g.id}
    `;
    ok(`${g.garment_id} | ${g.garment_type} → ${newStage}, location=shop`);
  }

  log("✅ Step 7 complete! Brovas awaiting trial at shop.");
}

// ─── STEP 8: First Brova Trial → needs_repair ──────────────────────────────

async function step8() {
  log("Step 8: First brova trial → needs_repair, send back to workshop...");
  const state = loadState();
  if (!state.orderId) fail("Missing state.");

  // Feedback page: garments at shop, not waiting_for_acceptance or completed
  log("Checking feedback page eligible garments...");
  const eligible = await sql`
    SELECT id, garment_id, garment_type, piece_stage, trip_number
    FROM garments
    WHERE order_id = ${state.orderId}
      AND location = 'shop'
      AND piece_stage NOT IN ('waiting_for_acceptance', 'completed')
    ORDER BY garment_id
  `;
  ok(`Found ${eligible.length} garments eligible for feedback`);

  const brovas = eligible.filter((g: any) => g.garment_type === "brova");
  if (brovas.length !== 2) fail(`Expected 2 brovas for trial, got ${brovas.length}`);

  // Reject both as needs_repair
  log("Rejecting both brovas as needs_repair...");
  for (const b of brovas) {
    // Create feedback record
    await sql`
      INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number, action, distribution, satisfaction_level, notes)
      VALUES (${b.id}, ${state.orderId}, ${state.staffUserId}, 'brova_trial', ${b.trip_number},
              'needs_repair_rejected', 'workshop', 3, 'Collar width needs adjustment, sleeve too long')
    `;

    // Update garment: piece_stage=brova_trialed, feedback_status=needs_repair, acceptance_status=false
    await sql`
      UPDATE garments SET
        piece_stage = 'brova_trialed',
        feedback_status = 'needs_repair',
        acceptance_status = false
      WHERE id = ${b.id}
    `;
    ok(`${b.garment_id} → brova_trialed, feedback=needs_repair, accepted=false`);
  }

  // Now send them back to workshop (mimics dispatch "Return to Workshop" tab)
  log("Sending rejected brovas back to workshop (trip 1→2)...");
  for (const b of brovas) {
    await sql`
      UPDATE garments SET
        piece_stage = 'waiting_cut',
        location = 'transit_to_workshop',
        trip_number = trip_number + 1,
        in_production = false
      WHERE id = ${b.id}
    `;
    ok(`${b.garment_id} → transit_to_workshop, trip=${b.trip_number + 1}`);
  }

  log("✅ Step 8 complete! Both brovas rejected and sent back (trip 2).");
}

// ─── STEP 9: Workshop re-receives trip 2, processes, dispatches ─────────────

async function step9() {
  log("Step 9: Workshop re-receives brova returns (trip 2), processes, dispatches...");
  const state = loadState();
  if (!state.orderId || !state.resourceIds) fail("Missing state.");

  const [cutterId, postCutterId, sewerId, finisherId, ironerId, qcId, soakerId] = state.resourceIds!;

  // Workshop receiving — Brova Returns tab: trip_number 2 or 3, garment_type='brova'
  log("Checking receiving — Brova Returns tab (trip 2-3)...");
  const returns = await sql`
    SELECT id, garment_id, piece_stage, trip_number, feedback_status
    FROM garments
    WHERE order_id = ${state.orderId}
      AND location = 'transit_to_workshop'
      AND garment_type = 'brova'
      AND trip_number IN (2, 3)
    ORDER BY garment_id
  `;
  ok(`Found ${returns.length} brova returns`);

  // Receive & Start
  log("Receiving & Starting brova returns...");
  for (const g of returns) {
    await sql`
      UPDATE garments SET
        location = 'workshop',
        in_production = true,
        piece_stage = 'waiting_cut',
        production_plan = NULL,
        completion_time = NULL,
        start_time = NULL
      WHERE id = ${g.id}
    `;
    ok(`${g.garment_id} received at workshop, reset for re-production`);
  }

  // Schedule from a random re-entry stage (e.g., sewing for brova 1, cutting for brova 2)
  log("Scheduling from different re-entry stages...");
  const reentryStages = ["sewing", "cutting"]; // Different stages to test properly
  const stageWorkerMap: Record<string, any> = {
    soaking: { key: "soaker", id: soakerId },
    cutting: { key: "cutter", id: cutterId },
    post_cutting: { key: "post_cutter", id: postCutterId },
    sewing: { key: "sewer", id: sewerId },
    finishing: { key: "finisher", id: finisherId },
    ironing: { key: "ironer", id: ironerId },
    quality_check: { key: "quality_checker", id: qcId },
  };

  const allStagesOrdered = ["soaking", "cutting", "post_cutting", "sewing", "finishing", "ironing", "quality_check"];
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < returns.length; i++) {
    const g = returns[i];
    const reentry = reentryStages[i];

    // Build partial plan from reentry onward
    const partialPlan: Record<string, string> = {};
    const startIdx = allStagesOrdered.indexOf(reentry);
    for (let j = startIdx; j < allStagesOrdered.length; j++) {
      const s = allStagesOrdered[j];
      partialPlan[stageWorkerMap[s].key] = stageWorkerMap[s].id;
    }

    await sql`
      UPDATE garments SET
        production_plan = ${JSON.stringify(partialPlan)}::jsonb,
        assigned_date = ${today},
        piece_stage = ${reentry}
      WHERE id = ${g.id}
    `;
    ok(`${g.garment_id} → re-entry at ${reentry}`);
  }

  // Process through stages
  log("Processing through terminal stages...");
  for (let i = 0; i < returns.length; i++) {
    const g = returns[i];
    const reentry = reentryStages[i];
    const startIdx = allStagesOrdered.indexOf(reentry);

    const progression = allStagesOrdered.slice(startIdx);
    progression.push("ready_for_dispatch");

    for (let j = 0; j < progression.length - 1; j++) {
      const from = progression[j];
      const to = progression[j + 1];
      const now = new Date().toISOString();

      await sql`
        UPDATE garments SET
          piece_stage = ${to},
          start_time = NULL,
          completion_time = ${now}::timestamptz,
          worker_history = COALESCE(worker_history, '{}'::jsonb) || ${JSON.stringify({ [stageWorkerMap[from].key]: stageWorkerMap[from].id })}::jsonb
        WHERE id = ${g.id}
      `;
    }
    ok(`${g.garment_id}: ${reentry} → ready_for_dispatch`);
  }

  // Dispatch back to shop
  log("Dispatching brovas back to shop...");
  const brovaIds = returns.map((g: any) => g.id);
  await sql`
    UPDATE garments SET
      location = 'transit_to_shop',
      in_production = false,
      feedback_status = NULL
    WHERE id = ANY(${brovaIds})
  `;
  ok("Brovas dispatched to shop (trip 2)");

  log("✅ Step 9 complete!");
}

// ─── STEP 10: Second brova trial → needs_repair (trip 2→3) ─────────────────

async function step10() {
  log("Step 10: Second brova trial → needs_repair, send back (trip 2→3)...");
  const state = loadState();
  if (!state.orderId) fail("Missing state.");

  // Shop receives
  log("Shop receiving brovas (trip 2)...");
  const inTransit = await sql`
    SELECT id, garment_id, garment_type FROM garments
    WHERE order_id = ${state.orderId} AND location = 'transit_to_shop' AND garment_type = 'brova'
  `;
  for (const g of inTransit) {
    await sql`UPDATE garments SET piece_stage = 'awaiting_trial', location = 'shop' WHERE id = ${g.id}`;
    ok(`${g.garment_id} received → awaiting_trial`);
  }

  // Reject as needs_repair again
  log("Rejecting both brovas as needs_repair (again)...");
  const brovas = await sql`
    SELECT id, garment_id, trip_number FROM garments
    WHERE order_id = ${state.orderId} AND garment_type = 'brova' AND location = 'shop'
  `;

  for (const b of brovas) {
    await sql`
      INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number, action, distribution, satisfaction_level, notes)
      VALUES (${b.id}, ${state.orderId}, ${state.staffUserId}, 'brova_trial', ${b.trip_number},
              'needs_repair_rejected', 'workshop', 2, 'Collar still not right, cuffs need tightening')
    `;
    await sql`
      UPDATE garments SET
        piece_stage = 'brova_trialed',
        feedback_status = 'needs_repair',
        acceptance_status = false
      WHERE id = ${b.id}
    `;
    ok(`${b.garment_id} → needs_repair (trip ${b.trip_number})`);
  }

  // Send back to workshop
  log("Sending back to workshop (trip 2→3)...");
  for (const b of brovas) {
    await sql`
      UPDATE garments SET
        piece_stage = 'waiting_cut',
        location = 'transit_to_workshop',
        trip_number = trip_number + 1,
        in_production = false
      WHERE id = ${b.id}
    `;
    ok(`${b.garment_id} → transit_to_workshop, trip=${b.trip_number + 1}`);
  }

  log("✅ Step 10 complete! Both brovas sent back trip 3.");
}

// ─── STEP 11: Workshop re-processes trip 3 ──────────────────────────────────

async function step11() {
  log("Step 11: Workshop re-receives trip 3, processes, dispatches...");
  const state = loadState();
  if (!state.orderId || !state.resourceIds) fail("Missing state.");

  const [cutterId, postCutterId, sewerId, finisherId, ironerId, qcId, soakerId] = state.resourceIds!;
  const allStagesOrdered = ["soaking", "cutting", "post_cutting", "sewing", "finishing", "ironing", "quality_check"];
  const stageWorkerMap: Record<string, any> = {
    soaking: { key: "soaker", id: soakerId },
    cutting: { key: "cutter", id: cutterId },
    post_cutting: { key: "post_cutter", id: postCutterId },
    sewing: { key: "sewer", id: sewerId },
    finishing: { key: "finisher", id: finisherId },
    ironing: { key: "ironer", id: ironerId },
    quality_check: { key: "quality_checker", id: qcId },
  };

  // Still Brova Returns tab (trip 2-3)
  const returns = await sql`
    SELECT id, garment_id, trip_number FROM garments
    WHERE order_id = ${state.orderId}
      AND location = 'transit_to_workshop'
      AND garment_type = 'brova'
      AND trip_number = 3
    ORDER BY garment_id
  `;
  ok(`Found ${returns.length} brova returns (trip 3)`);

  // Receive & Start
  for (const g of returns) {
    await sql`
      UPDATE garments SET
        location = 'workshop', in_production = true,
        piece_stage = 'waiting_cut',
        production_plan = NULL, completion_time = NULL, start_time = NULL
      WHERE id = ${g.id}
    `;
  }

  // Schedule from different stages: finishing for brova 1, ironing for brova 2
  const reentryStages = ["finishing", "ironing"];
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < returns.length; i++) {
    const g = returns[i];
    const reentry = reentryStages[i];
    const startIdx = allStagesOrdered.indexOf(reentry);
    const partialPlan: Record<string, string> = {};
    for (let j = startIdx; j < allStagesOrdered.length; j++) {
      const s = allStagesOrdered[j];
      partialPlan[stageWorkerMap[s].key] = stageWorkerMap[s].id;
    }

    await sql`
      UPDATE garments SET
        production_plan = ${JSON.stringify(partialPlan)}::jsonb,
        assigned_date = ${today},
        piece_stage = ${reentry}
      WHERE id = ${g.id}
    `;
    ok(`${g.garment_id} → re-entry at ${reentry}`);
  }

  // Process through stages
  for (let i = 0; i < returns.length; i++) {
    const g = returns[i];
    const reentry = reentryStages[i];
    const startIdx = allStagesOrdered.indexOf(reentry);
    const progression = [...allStagesOrdered.slice(startIdx), "ready_for_dispatch"];

    for (let j = 0; j < progression.length - 1; j++) {
      const from = progression[j];
      const to = progression[j + 1];
      await sql`
        UPDATE garments SET
          piece_stage = ${to}, start_time = NULL,
          completion_time = ${new Date().toISOString()}::timestamptz,
          worker_history = COALESCE(worker_history, '{}'::jsonb) || ${JSON.stringify({ [stageWorkerMap[from].key]: stageWorkerMap[from].id })}::jsonb
        WHERE id = ${g.id}
      `;
    }
    ok(`${g.garment_id}: ${reentry} → ready_for_dispatch`);
  }

  // Dispatch
  const ids = returns.map((g: any) => g.id);
  await sql`
    UPDATE garments SET location = 'transit_to_shop', in_production = false, feedback_status = NULL
    WHERE id = ANY(${ids})
  `;
  ok("Brovas dispatched to shop (trip 3)");
  log("✅ Step 11 complete!");
}

// ─── STEP 12: Third trial → needs_repair (trip 3→4 = alteration) ────────────

async function step12() {
  log("Step 12: Third brova trial → needs_repair (trip 3→4 = alteration #1)...");
  const state = loadState();
  if (!state.orderId) fail("Missing state.");

  // Shop receives trip 3
  log("Shop receiving brovas (trip 3)...");
  const inTransit = await sql`
    SELECT id, garment_id FROM garments
    WHERE order_id = ${state.orderId} AND location = 'transit_to_shop' AND garment_type = 'brova'
  `;
  for (const g of inTransit) {
    await sql`UPDATE garments SET piece_stage = 'awaiting_trial', location = 'shop' WHERE id = ${g.id}`;
    ok(`${g.garment_id} received → awaiting_trial`);
  }

  // Reject again
  log("Rejecting brovas (trip 3 → trip 4 = alteration #1)...");
  const brovas = await sql`
    SELECT id, garment_id, trip_number FROM garments
    WHERE order_id = ${state.orderId} AND garment_type = 'brova' AND location = 'shop'
  `;

  for (const b of brovas) {
    await sql`
      INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number, action, distribution, satisfaction_level, notes)
      VALUES (${b.id}, ${state.orderId}, ${state.staffUserId}, 'brova_trial', ${b.trip_number},
              'needs_repair_rejected', 'workshop', 2, 'Still not right, alteration needed')
    `;
    await sql`
      UPDATE garments SET
        piece_stage = 'brova_trialed', feedback_status = 'needs_repair', acceptance_status = false
      WHERE id = ${b.id}
    `;
  }

  // Send back — now trip becomes 4 (alteration #1 for brova: trip - 3 = 1)
  for (const b of brovas) {
    await sql`
      UPDATE garments SET
        piece_stage = 'waiting_cut', location = 'transit_to_workshop',
        trip_number = trip_number + 1, in_production = false
      WHERE id = ${b.id}
    `;
    ok(`${b.garment_id} → trip ${b.trip_number + 1} (alteration #${b.trip_number + 1 - 3})`);
  }

  log("✅ Step 12 complete! Brovas now at alteration level.");
}

// ─── STEP 13: Workshop alteration processing (trip 4) ───────────────────────

async function step13() {
  log("Step 13: Workshop processes alteration (trip 4)...");
  const state = loadState();
  if (!state.orderId || !state.resourceIds) fail("Missing state.");

  const [cutterId, postCutterId, sewerId, finisherId, ironerId, qcId, soakerId] = state.resourceIds!;
  const allStagesOrdered = ["soaking", "cutting", "post_cutting", "sewing", "finishing", "ironing", "quality_check"];
  const stageWorkerMap: Record<string, any> = {
    soaking: { key: "soaker", id: soakerId }, cutting: { key: "cutter", id: cutterId },
    post_cutting: { key: "post_cutter", id: postCutterId }, sewing: { key: "sewer", id: sewerId },
    finishing: { key: "finisher", id: finisherId }, ironing: { key: "ironer", id: ironerId },
    quality_check: { key: "quality_checker", id: qcId },
  };

  // Now received in Alteration In tab (brova trip >= 4)
  log("Checking receiving — Alteration In tab (trip >= 4 for brova)...");
  const alts = await sql`
    SELECT id, garment_id, trip_number FROM garments
    WHERE order_id = ${state.orderId}
      AND location = 'transit_to_workshop'
      AND garment_type = 'brova'
      AND trip_number >= 4
    ORDER BY garment_id
  `;
  ok(`Found ${alts.length} alteration garments`);

  // Receive
  for (const g of alts) {
    await sql`
      UPDATE garments SET
        location = 'workshop', in_production = true,
        piece_stage = 'waiting_cut',
        production_plan = NULL, completion_time = NULL, start_time = NULL
      WHERE id = ${g.id}
    `;
  }

  // Schedule with ReturnPlanDialog — re-entry at post_cutting for one, sewing for another
  const reentryStages = ["post_cutting", "sewing"];
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < alts.length; i++) {
    const g = alts[i];
    const reentry = reentryStages[i];
    const startIdx = allStagesOrdered.indexOf(reentry);
    const partialPlan: Record<string, string> = {};
    for (let j = startIdx; j < allStagesOrdered.length; j++) {
      const s = allStagesOrdered[j];
      partialPlan[stageWorkerMap[s].key] = stageWorkerMap[s].id;
    }
    await sql`
      UPDATE garments SET
        production_plan = ${JSON.stringify(partialPlan)}::jsonb,
        assigned_date = ${today}, piece_stage = ${reentry}
      WHERE id = ${g.id}
    `;
    ok(`${g.garment_id} → alteration re-entry at ${reentry}`);
  }

  // Process through stages
  for (let i = 0; i < alts.length; i++) {
    const g = alts[i];
    const reentry = reentryStages[i];
    const startIdx = allStagesOrdered.indexOf(reentry);
    const progression = [...allStagesOrdered.slice(startIdx), "ready_for_dispatch"];
    for (let j = 0; j < progression.length - 1; j++) {
      await sql`
        UPDATE garments SET
          piece_stage = ${progression[j + 1]}, start_time = NULL,
          completion_time = ${new Date().toISOString()}::timestamptz,
          worker_history = COALESCE(worker_history, '{}'::jsonb) || ${JSON.stringify({ [stageWorkerMap[progression[j]].key]: stageWorkerMap[progression[j]].id })}::jsonb
        WHERE id = ${g.id}
      `;
    }
    ok(`${g.garment_id}: ${reentry} → ready_for_dispatch`);
  }

  // Dispatch
  const ids = alts.map((g: any) => g.id);
  await sql`
    UPDATE garments SET location = 'transit_to_shop', in_production = false, feedback_status = NULL
    WHERE id = ANY(${ids})
  `;
  ok("Alteration brovas dispatched to shop");
  log("✅ Step 13 complete!");
}

// ─── STEP 14: Brova accepted, finals released ──────────────────────────────

async function step14() {
  log("Step 14: Brova trial → accepted! Finals released for production...");
  const state = loadState();
  if (!state.orderId) fail("Missing state.");

  // Shop receives alteration brovas
  log("Shop receiving alteration brovas...");
  const inTransit = await sql`
    SELECT id, garment_id FROM garments
    WHERE order_id = ${state.orderId} AND location = 'transit_to_shop' AND garment_type = 'brova'
  `;
  for (const g of inTransit) {
    await sql`UPDATE garments SET piece_stage = 'awaiting_trial', location = 'shop' WHERE id = ${g.id}`;
    ok(`${g.garment_id} → awaiting_trial`);
  }

  // Accept both brovas
  log("Accepting both brovas...");
  const brovas = await sql`
    SELECT id, garment_id, trip_number FROM garments
    WHERE order_id = ${state.orderId} AND garment_type = 'brova' AND location = 'shop'
  `;

  for (const b of brovas) {
    await sql`
      INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number, action, distribution, satisfaction_level, notes)
      VALUES (${b.id}, ${state.orderId}, ${state.staffUserId}, 'brova_trial', ${b.trip_number},
              'accepted', 'shop', 5, 'Looks perfect now!')
    `;
    await sql`
      UPDATE garments SET
        piece_stage = 'brova_trialed',
        feedback_status = 'accepted',
        acceptance_status = true
      WHERE id = ${b.id}
    `;
    ok(`${b.garment_id} → ACCEPTED (trip ${b.trip_number})`);
  }

  // Release finals: waiting_for_acceptance → waiting_cut
  log("Releasing finals for production...");
  const released = await sql`
    UPDATE garments SET
      piece_stage = 'waiting_cut'
    WHERE order_id = ${state.orderId}
      AND garment_type = 'final'
      AND piece_stage = 'waiting_for_acceptance'
    RETURNING garment_id, piece_stage
  `;
  for (const f of released) {
    ok(`${f.garment_id} → ${f.piece_stage} (released for production!)`);
  }

  // Record partial payment (advance at brova acceptance)
  log("Recording advance payment at cashier...");
  const [orderInfo] = await sql`SELECT order_total FROM orders WHERE id = ${state.orderId}`;
  const advanceAmount = Math.round(Number(orderInfo.order_total) * 0.5 * 1000) / 1000; // 50% advance

  await sql`
    INSERT INTO payment_transactions (order_id, amount, payment_type, transaction_type, cashier_id)
    VALUES (${state.orderId}, ${advanceAmount}, 'cash', 'payment', ${state.staffUserId})
  `;
  await sql`UPDATE orders SET paid = ${advanceAmount} WHERE id = ${state.orderId}`;
  ok(`Advance payment: ${advanceAmount} KWD (50% of ${orderInfo.order_total})`);

  log("✅ Step 14 complete! Brovas accepted, finals released, advance paid.");
}

// ─── STEP 15: Finals through full workshop cycle ────────────────────────────

async function step15() {
  log("Step 15: Finals through full workshop cycle...");
  const state = loadState();
  if (!state.orderId || !state.resourceIds) fail("Missing state.");

  const [cutterId, postCutterId, sewerId, finisherId, ironerId, qcId, soakerId] = state.resourceIds!;
  const allStagesOrdered = ["cutting", "post_cutting", "sewing", "finishing", "ironing", "quality_check"];
  const stageWorkerMap: Record<string, any> = {
    cutting: { key: "cutter", id: cutterId },
    post_cutting: { key: "post_cutter", id: postCutterId },
    sewing: { key: "sewer", id: sewerId },
    finishing: { key: "finisher", id: finisherId },
    ironing: { key: "ironer", id: ironerId },
    quality_check: { key: "quality_checker", id: qcId },
  };

  // Dispatch finals from shop to workshop
  log("Dispatching finals from shop to workshop...");
  const finals = await sql`
    SELECT id, garment_id FROM garments
    WHERE order_id = ${state.orderId} AND garment_type = 'final'
    ORDER BY garment_id
  `;
  await sql`
    UPDATE garments SET location = 'transit_to_workshop'
    WHERE order_id = ${state.orderId} AND garment_type = 'final'
  `;

  // Workshop receives finals
  log("Workshop receiving finals...");
  await sql`
    UPDATE garments SET
      location = 'workshop', in_production = true
    WHERE order_id = ${state.orderId} AND garment_type = 'final'
  `;

  // Schedule finals (no soaking — finals don't have soaking in this test)
  const today = new Date().toISOString().slice(0, 10);
  const plan: Record<string, string> = {};
  for (const s of allStagesOrdered) {
    plan[stageWorkerMap[s].key] = stageWorkerMap[s].id;
  }

  await sql`
    UPDATE garments SET
      assigned_date = ${today},
      piece_stage = 'cutting'
    WHERE order_id = ${state.orderId} AND garment_type = 'final'
  `;

  // Process through all stages
  log("Processing finals through terminals...");
  for (const f of finals) {
    for (let i = 0; i < allStagesOrdered.length; i++) {
      const from = allStagesOrdered[i];
      const to = i < allStagesOrdered.length - 1 ? allStagesOrdered[i + 1] : "ready_for_dispatch";
      await sql`
        UPDATE garments SET
          piece_stage = ${to}, start_time = NULL,
          completion_time = ${new Date().toISOString()}::timestamptz,
          worker_history = COALESCE(worker_history, '{}'::jsonb) || ${JSON.stringify({ [stageWorkerMap[from].key]: stageWorkerMap[from].id })}::jsonb
        WHERE id = ${f.id}
      `;
    }
    ok(`${f.garment_id}: cutting → ready_for_dispatch`);
  }

  // Dispatch finals to shop
  log("Dispatching finals to shop...");
  await sql`
    UPDATE garments SET location = 'transit_to_shop', in_production = false, feedback_status = NULL
    WHERE order_id = ${state.orderId} AND garment_type = 'final'
  `;
  ok("Finals dispatched to shop");

  // Shop receives finals
  log("Shop receiving finals...");
  await sql`
    UPDATE garments SET piece_stage = 'ready_for_pickup', location = 'shop'
    WHERE order_id = ${state.orderId} AND garment_type = 'final'
  `;
  ok("Finals at shop: ready_for_pickup");

  log("✅ Step 15 complete!");
}

// ─── STEP 16: Final collection — 1 accepted, 1 rejected ────────────────────

async function step16() {
  log("Step 16: Final collection — 1 accepted, 1 rejected...");
  const state = loadState();
  if (!state.orderId) fail("Missing state.");

  const finals = await sql`
    SELECT id, garment_id, trip_number FROM garments
    WHERE order_id = ${state.orderId} AND garment_type = 'final' AND location = 'shop'
    ORDER BY garment_id
  `;

  if (finals.length !== 2) fail(`Expected 2 finals, got ${finals.length}`);

  // Final 1 (28-3, express): ACCEPTED
  log(`Accepting final ${finals[0].garment_id}...`);
  await sql`
    INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number, action, distribution, satisfaction_level, notes)
    VALUES (${finals[0].id}, ${state.orderId}, ${state.staffUserId}, 'final_collection', ${finals[0].trip_number},
            'collected', 'pickup', 5, 'Perfect fit, customer happy')
  `;
  await sql`
    UPDATE garments SET
      piece_stage = 'completed',
      feedback_status = 'accepted',
      acceptance_status = true,
      fulfillment_type = 'collected'
    WHERE id = ${finals[0].id}
  `;
  ok(`${finals[0].garment_id} → COMPLETED (collected)`);

  // Final 2 (28-4, normal): REJECTED — needs_repair
  log(`Rejecting final ${finals[1].garment_id} as needs_repair...`);
  await sql`
    INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number, action, distribution, satisfaction_level, notes)
    VALUES (${finals[1].id}, ${state.orderId}, ${state.staffUserId}, 'final_collection', ${finals[1].trip_number},
            'needs_repair', 'workshop', 3, 'Sleeve length slightly off, needs adjustment')
  `;
  await sql`
    UPDATE garments SET
      piece_stage = 'brova_trialed',
      feedback_status = 'needs_repair',
      acceptance_status = false
    WHERE id = ${finals[1].id}
  `;
  ok(`${finals[1].garment_id} → needs_repair (will go as alteration)`);

  // Send rejected final back to workshop (trip 1→2 = alteration #1 for final)
  log("Sending rejected final to workshop (trip 1→2 = alteration #1)...");
  await sql`
    UPDATE garments SET
      piece_stage = 'waiting_cut',
      location = 'transit_to_workshop',
      trip_number = trip_number + 1,
      in_production = false
    WHERE id = ${finals[1].id}
  `;
  ok(`${finals[1].garment_id} → transit_to_workshop, trip=2 (alteration #1)`);

  log("✅ Step 16 complete!");
}

// ─── STEP 17: Final alteration → accepted → order complete ──────────────────

async function step17() {
  log("Step 17: Final alteration cycle → accepted → order complete...");
  const state = loadState();
  if (!state.orderId || !state.resourceIds) fail("Missing state.");

  const [cutterId, postCutterId, sewerId, finisherId, ironerId, qcId] = state.resourceIds!;
  const allStagesOrdered = ["cutting", "post_cutting", "sewing", "finishing", "ironing", "quality_check"];
  const stageWorkerMap: Record<string, any> = {
    cutting: { key: "cutter", id: cutterId },
    post_cutting: { key: "post_cutter", id: postCutterId },
    sewing: { key: "sewer", id: sewerId },
    finishing: { key: "finisher", id: finisherId },
    ironing: { key: "ironer", id: ironerId },
    quality_check: { key: "quality_checker", id: qcId },
  };

  // Workshop receives in Alteration In tab (final trip >= 2)
  log("Workshop receiving final alteration...");
  const [alt] = await sql`
    SELECT id, garment_id, trip_number FROM garments
    WHERE order_id = ${state.orderId}
      AND garment_type = 'final'
      AND location = 'transit_to_workshop'
      AND trip_number >= 2
  `;

  await sql`
    UPDATE garments SET
      location = 'workshop', in_production = true,
      piece_stage = 'waiting_cut',
      production_plan = NULL, completion_time = NULL, start_time = NULL
    WHERE id = ${alt.id}
  `;

  // Schedule from finishing (random re-entry)
  const reentry = "finishing";
  const today = new Date().toISOString().slice(0, 10);
  const startIdx = allStagesOrdered.indexOf(reentry);
  const partialPlan: Record<string, string> = {};
  for (let j = startIdx; j < allStagesOrdered.length; j++) {
    const s = allStagesOrdered[j];
    partialPlan[stageWorkerMap[s].key] = stageWorkerMap[s].id;
  }

  await sql`
    UPDATE garments SET
      production_plan = ${JSON.stringify(partialPlan)}::jsonb,
      assigned_date = ${today}, piece_stage = ${reentry}
    WHERE id = ${alt.id}
  `;
  ok(`${alt.garment_id} → alteration re-entry at ${reentry}`);

  // Process through stages
  const progression = [...allStagesOrdered.slice(startIdx), "ready_for_dispatch"];
  for (let j = 0; j < progression.length - 1; j++) {
    await sql`
      UPDATE garments SET
        piece_stage = ${progression[j + 1]}, start_time = NULL,
        completion_time = ${new Date().toISOString()}::timestamptz,
        worker_history = COALESCE(worker_history, '{}'::jsonb) || ${JSON.stringify({ [stageWorkerMap[progression[j]].key]: stageWorkerMap[progression[j]].id })}::jsonb
      WHERE id = ${alt.id}
    `;
  }
  ok(`${alt.garment_id}: ${reentry} → ready_for_dispatch`);

  // Dispatch to shop
  await sql`
    UPDATE garments SET location = 'transit_to_shop', in_production = false, feedback_status = NULL
    WHERE id = ${alt.id}
  `;

  // Shop receives
  await sql`UPDATE garments SET piece_stage = 'ready_for_pickup', location = 'shop' WHERE id = ${alt.id}`;

  // Accept final
  log("Accepting final after alteration...");
  const [final] = await sql`SELECT id, garment_id, trip_number FROM garments WHERE id = ${alt.id}`;
  await sql`
    INSERT INTO garment_feedback (garment_id, order_id, staff_id, feedback_type, trip_number, action, distribution, satisfaction_level, notes)
    VALUES (${final.id}, ${state.orderId}, ${state.staffUserId}, 'final_collection', ${final.trip_number},
            'collected', 'pickup', 4, 'Fixed, customer satisfied')
  `;
  await sql`
    UPDATE garments SET
      piece_stage = 'completed',
      feedback_status = 'accepted',
      acceptance_status = true,
      fulfillment_type = 'collected'
    WHERE id = ${final.id}
  `;
  ok(`${final.garment_id} → COMPLETED`);

  // Pay remaining balance
  log("Paying remaining balance...");
  const [orderInfo] = await sql`SELECT order_total, paid FROM orders WHERE id = ${state.orderId}`;
  const remaining = Number(orderInfo.order_total) - Number(orderInfo.paid);
  if (remaining > 0) {
    await sql`
      INSERT INTO payment_transactions (order_id, amount, payment_type, transaction_type, cashier_id)
      VALUES (${state.orderId}, ${remaining}, 'knet', 'payment', ${state.staffUserId})
    `;
    await sql`UPDATE orders SET paid = order_total WHERE id = ${state.orderId}`;
    ok(`Final payment: ${remaining} KWD (knet). Balance: 0`);
  }

  // Check if all garments are completed → order_phase = completed
  log("Checking if all garments completed...");
  const incomplete = await sql`
    SELECT COUNT(*) as cnt FROM garments
    WHERE order_id = ${state.orderId} AND piece_stage != 'completed'
  `;

  // Brovas are at brova_trialed (accepted) — they're done but not 'completed' stage
  // Only finals need to be 'completed' for the order to be complete
  const incompleteFinals = await sql`
    SELECT COUNT(*) as cnt FROM garments
    WHERE order_id = ${state.orderId} AND garment_type = 'final' AND piece_stage != 'completed'
  `;

  if (Number(incompleteFinals[0].cnt) === 0) {
    await sql`UPDATE work_orders SET order_phase = 'completed' WHERE order_id = ${state.orderId}`;
    ok("All finals completed → order_phase = completed!");
  } else {
    info(`${incompleteFinals[0].cnt} finals still incomplete`);
  }

  log("✅ Step 17 complete! Full workflow test done!");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

const step = process.argv[2] || "status";

const steps: Record<string, () => Promise<void>> = {
  seed, step1, step2, step3, step4, step5, step6, step7, step8,
  step9, step10, step11, step12, step13, step14, step15, step16, step17,
  status: showStatus,
};

if (!steps[step]) {
  console.log(`Unknown step: ${step}`);
  console.log(`Available: ${Object.keys(steps).join(", ")}`);
  process.exit(1);
}

steps[step]()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFatal error:", err);
    sql.end().then(() => process.exit(1));
  });
