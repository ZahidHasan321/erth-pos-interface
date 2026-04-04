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
       'waiting_cut', 'shop', 1, 12.250, 9, 0),
      -- Brova 2: Navy, soaking, normal, 14-day delivery
      (${state.orderId}, ${state.orderId + '-2'}, ${state.fabricIds![1]}, ${state.styleId}, ${state.measurementId},
       'IN', 'C15', 3.5, 'brova', true, false, ${deliveryDate},
       'kuwaiti', 'band', 'no', 'square', 'double', 'curved', 'single',
       true, true, false, 'ZIPPER', 2,
       'waiting_cut', 'shop', 1, 14.000, 9, 0),
      -- Final 1: White, EXPRESS, waiting_for_acceptance
      (${state.orderId}, ${state.orderId + '-3'}, ${state.fabricIds![0]}, ${state.styleId}, ${state.measurementId},
       'IN', 'C01', 3.5, 'final', false, true, ${expressDeliveryDate},
       'kuwaiti', 'stand', 'yes', 'round', 'single', 'standard', 'single',
       false, false, false, 'BUTTON', 1,
       'waiting_for_acceptance', 'shop', 1, 12.250, 9, 0),
      -- Final 2: Navy, normal, waiting_for_acceptance
      (${state.orderId}, ${state.orderId + '-4'}, ${state.fabricIds![1]}, ${state.styleId}, ${state.measurementId},
       'IN', 'C15', 3.5, 'final', false, false, ${deliveryDate},
       'kuwaiti', 'band', 'no', 'square', 'double', 'curved', 'single',
       true, true, false, 'ZIPPER', 2,
       'waiting_for_acceptance', 'shop', 1, 14.000, 9, 0)
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

// ─── MAIN ────────────────────────────────────────────────────────────────────

const step = process.argv[2] || "status";

const steps: Record<string, () => Promise<void>> = {
  seed,
  step1,
  step2,
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
