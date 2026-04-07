/**
 * Workshop Receiving page — proper seed data.
 *
 * Each order goes through the full lifecycle using the exact same SQL operations
 * as the app service functions:
 *
 *  1. Create order (INSERT + complete_work_order RPC + save_work_order_garments RPC)
 *  2. Dispatch to workshop  → mirrors dispatchOrder()
 *  3. Workshop receive & start → mirrors receiveAndStartGarments()
 *  4. Production (brovas → ready_for_dispatch, finals stay parked)
 *  5. Workshop dispatch to shop → mirrors dispatchGarments()
 *  6. Shop receive (brovas → awaiting_trial, finals → ready_for_pickup)
 *  7. Brova feedback → mirrors feedback.$orderId submit logic + evaluateBrovaFeedback()
 *  8. Return dispatch → mirrors dispatchGarmentToWorkshop()
 *  9. Release finals if brova accepted → mirrors workshop releaseFinals()
 *
 * Creates 6 orders:
 *
 *   Incoming (trip=1, transit_to_workshop):
 *     A) ERTH   — 2B (B1 express+soak+del+7, B2 soak+del+14) + 2F (F1 express+del+7, F2 del+14)
 *     B) SAKKBA — 1B (express+del-2) + 1F (del-2), OVERDUE
 *     C) ERTH   — 3B (B1 del+10, B2 soak+del+10, B3 express+del+5), home delivery
 *
 *   Brova Returns (trip=2):
 *     D) ERTH   — 2B trip=2 both needs_repair_rejected, 2F still parked at workshop
 *     E) ERTH   — 2B trip=2 (B1 needs_repair_accepted, B2 needs_repair_rejected), 2F released
 *
 *   Brova Returns (trip=3):
 *     F) SAKKBA — 2B trip=3 (both accepted on trip-2), 2F advanced to sewing at workshop
 *
 * Run: pnpm --filter @repo/database db:seed-receiving
 */

import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";
import { evaluateBrovaFeedback } from "../src/utils";

dotenv.config({ path: path.join(__dirname, "../.env") });

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

function log(msg: string) { console.log(`\n→ ${msg}`); }
function ok(msg: string)  { console.log(`  ✓ ${msg}`); }
function fail(msg: string): never { console.error(`  ✗ ${msg}`); process.exit(1); }

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Service-function mirrors ──────────────────────────────────────────────────

/**
 * Mirrors dispatchOrder() in apps/pos-interface/src/api/orders.ts
 * - Sets location=transit_to_workshop, trip_number=1 on all garments
 * - Appends dispatch_log entries (to_workshop)
 * - Sets work_orders.order_phase=in_progress
 */
async function dispatchOrder(orderId: number, garmentUuids: string[]): Promise<void> {
  await sql`
    UPDATE garments
    SET location = 'transit_to_workshop', trip_number = 1
    WHERE id = ANY(${garmentUuids})
  `;

  const rows = await sql`
    SELECT id, trip_number FROM garments WHERE id = ANY(${garmentUuids})
  `;
  if (rows.length > 0) {
    for (const r of rows) {
      await sql`
        INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
        VALUES (${r.id}, ${orderId}, 'to_workshop', ${r.trip_number})
      `;
    }
  }

  await sql`UPDATE work_orders SET order_phase = 'in_progress' WHERE order_id = ${orderId}`;
}

/**
 * Mirrors receiveAndStartGarments() in apps/workshop/src/api/garments.ts
 * Steps replicated exactly:
 *   1. Set all location=workshop
 *   2. Accepted brovas → ready_for_dispatch, in_production=false
 *   3. Non-waiting_for_acceptance, non-accepted → in_production=true
 *   4. Return brovas with non-accepted feedback at brova_trialed → waiting_cut
 *   5. Trip>1: clear production_plan, completion_time, start_time
 */
async function receiveAndStartGarments(garmentUuids: string[]): Promise<void> {
  // Step 1
  await sql`UPDATE garments SET location = 'workshop' WHERE id = ANY(${garmentUuids})`;

  // Step 2: accepted brovas go straight to ready_for_dispatch
  await sql`
    UPDATE garments
    SET piece_stage = 'ready_for_dispatch', in_production = false
    WHERE id = ANY(${garmentUuids}) AND feedback_status = 'accepted'
  `;

  // Step 3: start production for everything that's not parked/accepted
  await sql`
    UPDATE garments
    SET in_production = true
    WHERE id = ANY(${garmentUuids})
      AND (piece_stage != 'waiting_for_acceptance' OR piece_stage IS NULL)
      AND (feedback_status != 'accepted' OR feedback_status IS NULL)
  `;

  // Step 4: return brovas with feedback, stuck at brova_trialed → reset to waiting_cut
  await sql`
    UPDATE garments
    SET piece_stage = 'waiting_cut'
    WHERE id = ANY(${garmentUuids})
      AND feedback_status IS NOT NULL
      AND feedback_status != 'accepted'
      AND piece_stage = 'brova_trialed'
  `;

  // Step 5: clear stale production fields for returning garments
  await sql`
    UPDATE garments
    SET production_plan = NULL, completion_time = NULL, start_time = NULL
    WHERE id = ANY(${garmentUuids}) AND trip_number > 1
  `;
}

/**
 * Advances brovas to ready_for_dispatch (production complete).
 * Finals are ignored (still parked at waiting_for_acceptance).
 */
async function completeProduction(brovaUuids: string[]): Promise<void> {
  const now = new Date().toISOString();
  await sql`
    UPDATE garments
    SET piece_stage = 'ready_for_dispatch',
        in_production = false,
        completion_time = ${now}::timestamptz
    WHERE id = ANY(${brovaUuids})
  `;
}

/**
 * Mirrors dispatchGarments() in apps/workshop/src/api/garments.ts
 * - Sets location=transit_to_shop, in_production=false, feedback_status=null
 * - Appends dispatch_log entries (to_shop)
 */
async function workshopDispatchToShop(orderId: number, garmentUuids: string[]): Promise<void> {
  await sql`
    UPDATE garments
    SET location = 'transit_to_shop', in_production = false, feedback_status = NULL
    WHERE id = ANY(${garmentUuids})
  `;

  const rows = await sql`
    SELECT id, trip_number FROM garments WHERE id = ANY(${garmentUuids})
  `;
  for (const r of rows) {
    await sql`
      INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
      VALUES (${r.id}, ${orderId}, 'to_shop', ${r.trip_number})
    `;
  }
}

/**
 * Shop receives garments coming from workshop:
 * - Brovas → awaiting_trial, location=shop
 * - Finals → ready_for_pickup, location=shop
 */
async function shopReceive(garmentUuids: string[]): Promise<void> {
  await sql`
    UPDATE garments
    SET piece_stage = 'awaiting_trial', location = 'shop'
    WHERE id = ANY(${garmentUuids}) AND garment_type = 'brova'
  `;
  await sql`
    UPDATE garments
    SET piece_stage = 'ready_for_pickup', location = 'shop'
    WHERE id = ANY(${garmentUuids}) AND garment_type = 'final'
  `;
}

/**
 * Submits brova trial feedback for a single brova.
 * Mirrors the submit logic in feedback.$orderId.tsx:
 *   - Calls evaluateBrovaFeedback() to determine result
 *   - Updates garment (piece_stage, acceptance_status, feedback_status)
 *   - Inserts garment_feedback record
 *
 * Returns the evaluateBrovaFeedback result so the caller can act on releaseFinals / brovaGoesBack.
 */
async function submitBrovaFeedback(
  brovaUuid: string,
  orderId: number,
  staffId: string,
  feedbackAction: "accepted" | "needs_repair_accepted" | "needs_repair_rejected" | "needs_redo",
  allBrovaStates: { id: string; piece_stage: string; acceptance_status: boolean | null; feedback_status: string | null }[],
  notes: string,
  tripNumber: number,
) {
  const result = evaluateBrovaFeedback(
    feedbackAction,
    allBrovaStates as any,
    brovaUuid,
  );

  await sql`
    UPDATE garments
    SET piece_stage = ${result.newStage},
        acceptance_status = ${result.acceptanceStatus},
        feedback_status = ${result.feedbackStatus}
    WHERE id = ${brovaUuid}
  `;

  await sql`
    INSERT INTO garment_feedback (
      garment_id, order_id, staff_id, feedback_type,
      trip_number, action, distribution, satisfaction_level, notes
    ) VALUES (
      ${brovaUuid}, ${orderId}, ${staffId}, 'brova_trial',
      ${tripNumber}, ${feedbackAction}, 'workshop', 4, ${notes}
    )
  `;

  return result;
}

/**
 * Mirrors dispatchGarmentToWorkshop() in apps/pos-interface/src/api/garments.ts
 * - Sets location=transit_to_workshop, piece_stage=waiting_cut, trip_number++
 * - Clears production_plan, completion_time, start_time
 * - Appends dispatch_log entry (to_workshop)
 */
async function returnBrovaToWorkshop(garmentUuid: string, orderId: number, currentTripNumber: number): Promise<void> {
  await sql`
    UPDATE garments
    SET location = 'transit_to_workshop',
        piece_stage = 'waiting_cut',
        in_production = false,
        trip_number = ${currentTripNumber + 1},
        production_plan = NULL,
        completion_time = NULL,
        start_time = NULL
    WHERE id = ${garmentUuid}
  `;
  await sql`
    INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
    VALUES (${garmentUuid}, ${orderId}, 'to_workshop', ${currentTripNumber + 1})
  `;
}

/**
 * Mirrors releaseFinals() in apps/workshop/src/api/garments.ts
 * - Moves finals from waiting_for_acceptance → waiting_cut, in_production=false
 */
async function releaseFinals(finalUuids: string[]): Promise<void> {
  await sql`
    UPDATE garments
    SET piece_stage = 'waiting_cut', in_production = false
    WHERE id = ANY(${finalUuids}) AND piece_stage = 'waiting_for_acceptance'
  `;
}

/**
 * Advances finals to a given piece_stage with in_production=true.
 * Simulates the workshop scheduler + terminal advancing finals through production.
 */
async function advanceFinalsToStage(finalUuids: string[], stage: string): Promise<void> {
  const now = new Date().toISOString();
  await sql`
    UPDATE garments
    SET piece_stage = ${stage},
        in_production = true,
        completion_time = ${now}::timestamptz
    WHERE id = ANY(${finalUuids})
  `;
}

// ── Order creation helpers ────────────────────────────────────────────────────

async function createCustomer(name: string, phone: string): Promise<number> {
  const [c] = await sql`
    INSERT INTO customers (name, phone, nick_name, country_code, city, block, street, house_no, area, nationality, account_type)
    VALUES (${name}, ${phone}, ${name.split(" ")[0]}, '+965', 'Kuwait City', '1', 'Seed St', '10', 'Salmiya', 'Kuwaiti', 'Primary')
    RETURNING id
  `;
  return c.id;
}

async function createMeasurement(customerId: number, staffId: string): Promise<string> {
  const [m] = await sql`
    INSERT INTO measurements (
      customer_id, measurer_id, measurement_date, type,
      collar_width, collar_height, shoulder, armhole, chest_upper, chest_full,
      sleeve_length, sleeve_width, elbow, waist_front, waist_back, waist_full,
      length_front, length_back, bottom, notes
    ) VALUES (
      ${customerId}, ${staffId}, NOW(), 'Body',
      17.5, 4.0, 47.0, 24.0, 52.0, 54.0,
      62.0, 18.0, 20.0, 46.0, 48.0, 94.0,
      140.0, 142.0, 56.0, 'Seed receiving measurement'
    ) RETURNING id
  `;
  return m.id;
}

interface GarmentDef {
  type: "brova" | "final";
  express?: boolean;
  soaking?: boolean;
  deliveryDays: number;   // per-garment delivery date
  fabricIdx?: number;
}

/**
 * Replicates both save_work_order_garments RPC + complete_work_order RPC using raw postgres
 * (RPCs are not SECURITY DEFINER so can't be called via anon key from scripts).
 *
 * save_work_order_garments logic:
 *   1. Ensure order_type=WORK
 *   2. Upsert work_orders (charges, delivery_date, home_delivery)
 *   3. Delete existing garments + insert new ones
 *   4. Auto-park finals (piece_stage=waiting_for_acceptance) if any brova exists
 *
 * complete_work_order logic:
 *   5. Get/generate invoice number via nextval('invoice_seq')
 *   6. Confirm order (checkout_status=confirmed, totals, payment)
 *   7. Upsert work_orders (invoice_number, advance, order_phase=new)
 */
async function createConfirmedOrder(
  brand: "ERTH" | "SAKKBA" | "QASS",
  customerId: number,
  staffId: string,
  measId: string,
  fabricIds: number[],
  styleId: number,
  homeDelivery: boolean,
  garmentDefs: GarmentDef[],
): Promise<{ orderId: number; garmentUuids: string[] }> {
  const expressCount  = garmentDefs.filter(g => g.express).length;
  const soakingCount  = garmentDefs.filter(g => g.soaking).length;
  const expressCharge  = expressCount * 3;
  const soakingCharge  = soakingCount * 1.5;
  const stitchingCharge = garmentDefs.length * 9;
  const fabricCharge   = garmentDefs.length * 12.5;
  const orderTotal     = fabricCharge + stitchingCharge + expressCharge + soakingCharge + (homeDelivery ? 2 : 0);
  const deliveryDate   = daysFromNow(Math.min(...garmentDefs.map(g => g.deliveryDays)));

  // ── 1. Insert draft order ─────────────────────────────────────────────────
  const [order] = await sql`
    INSERT INTO orders (customer_id, order_taker_id, order_date, brand, checkout_status, order_type)
    VALUES (${customerId}, ${staffId}, NOW(), ${brand}, 'draft', 'WORK')
    RETURNING id
  `;
  const orderId: number = order.id;

  // ── 2. save_work_order_garments: upsert work_orders ───────────────────────
  await sql`
    INSERT INTO work_orders (order_id, num_of_fabrics, fabric_charge, stitching_charge, style_charge, stitching_price, delivery_date, home_delivery)
    VALUES (${orderId}, ${garmentDefs.length}, ${fabricCharge}, ${stitchingCharge}, 0, 9, ${deliveryDate}, ${homeDelivery})
    ON CONFLICT (order_id) DO UPDATE SET
      num_of_fabrics   = EXCLUDED.num_of_fabrics,
      fabric_charge    = EXCLUDED.fabric_charge,
      stitching_charge = EXCLUDED.stitching_charge,
      style_charge     = EXCLUDED.style_charge,
      stitching_price  = EXCLUDED.stitching_price,
      delivery_date    = EXCLUDED.delivery_date,
      home_delivery    = EXCLUDED.home_delivery
  `;

  // ── 3. save_work_order_garments: delete + insert garments ────────────────
  await sql`DELETE FROM garments WHERE order_id = ${orderId}`;

  for (let i = 0; i < garmentDefs.length; i++) {
    const g = garmentDefs[i];
    const garmentId  = `${orderId}-${i + 1}`;
    const fabricId   = fabricIds[g.fabricIdx ?? (i % fabricIds.length)];
    const garmentDel = daysFromNow(g.deliveryDays);
    const color      = i % 2 === 0 ? "C01" : "C15";

    await sql`
      INSERT INTO garments (
        order_id, garment_id, fabric_id, style_id, measurement_id,
        fabric_source, quantity, fabric_length,
        fabric_price_snapshot, stitching_price_snapshot, style_price_snapshot,
        garment_type, soaking, express, delivery_date,
        piece_stage, style, collar_type, collar_button, cuffs_type, cuffs_thickness,
        front_pocket_type, front_pocket_thickness, wallet_pocket, pen_holder,
        small_tabaggi, jabzour_1, lines,
        color, location, trip_number, home_delivery
      ) VALUES (
        ${orderId}, ${garmentId}, ${fabricId}, ${styleId}, ${measId},
        'IN', 1, 3.5,
        12.5, 9, 0,
        ${g.type}, ${g.soaking ?? false}, ${g.express ?? false}, ${garmentDel},
        'waiting_cut', 'kuwaiti', 'stand', 'yes', 'round', 'single',
        'standard', 'single', false, false,
        false, 'BUTTON', 1,
        ${color}, 'shop', 0, ${homeDelivery}
      )
    `;
  }

  // ── 4. save_work_order_garments: auto-park finals if any brova exists ─────
  const hasBrova = garmentDefs.some(g => g.type === "brova");
  if (hasBrova) {
    await sql`
      UPDATE garments
      SET piece_stage = 'waiting_for_acceptance'
      WHERE order_id = ${orderId} AND garment_type = 'final' AND piece_stage = 'waiting_cut'
    `;
  }

  // ── 5. complete_work_order: get invoice number ────────────────────────────
  const [invRow] = await sql`SELECT nextval('invoice_seq') AS inv`;
  const invoiceNumber: number = invRow.inv;

  // ── 6. complete_work_order: confirm order ─────────────────────────────────
  await sql`
    UPDATE orders SET
      checkout_status = 'confirmed',
      order_type      = 'WORK',
      payment_type    = 'cash',
      paid            = 0,
      order_taker_id  = ${staffId},
      order_total     = ${orderTotal},
      express_charge  = ${expressCharge},
      soaking_charge  = ${soakingCharge},
      delivery_charge = ${homeDelivery ? 2 : 0},
      order_date      = NOW()
    WHERE id = ${orderId}
  `;

  // ── 7. complete_work_order: upsert work_orders (invoice + phase) ──────────
  await sql`
    INSERT INTO work_orders (order_id, invoice_number, delivery_date, advance, fabric_charge, stitching_charge, style_charge, stitching_price, home_delivery, order_phase)
    VALUES (${orderId}, ${invoiceNumber}, ${deliveryDate}, 0, ${fabricCharge}, ${stitchingCharge}, 0, 9, ${homeDelivery}, 'new')
    ON CONFLICT (order_id) DO UPDATE SET
      invoice_number   = EXCLUDED.invoice_number,
      delivery_date    = EXCLUDED.delivery_date,
      advance          = EXCLUDED.advance,
      fabric_charge    = EXCLUDED.fabric_charge,
      stitching_charge = EXCLUDED.stitching_charge,
      style_charge     = EXCLUDED.style_charge,
      stitching_price  = EXCLUDED.stitching_price,
      home_delivery    = EXCLUDED.home_delivery
  `;

  // ── Fetch garment UUIDs in insertion order ────────────────────────────────
  const garmentRows = await sql`
    SELECT id FROM garments WHERE order_id = ${orderId} ORDER BY garment_id
  `;
  const garmentUuids = garmentRows.map((g: { id: string }) => g.id);

  return { orderId, garmentUuids };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log("Workshop Receiving seed — starting");

  // ── Remove previously seeded bad data ────────────────────────────────────
  log("Removing previous seed data (#52–#57)...");
  await sql`DELETE FROM orders WHERE id IN (52, 53, 54, 55, 56, 57)`;
  ok("Removed orders 52–57 (cascades to garments, feedback, dispatch_log)");

  // ── Prerequisites ─────────────────────────────────────────────────────────
  log("Finding prerequisites...");

  const users = await sql`SELECT id, name, department FROM users WHERE is_active = true LIMIT 5`;
  if (!users.length) fail("No active users found");
  const staff = users.find((u: { department: string }) => u.department === "shop") ?? users[0];
  ok(`Staff user: ${staff.name} (${staff.id})`);

  const fabrics = await sql`SELECT id FROM fabrics LIMIT 4`;
  if (fabrics.length < 2) fail("Need at least 2 fabrics");
  const fabricIds: number[] = fabrics.map((f: { id: number }) => f.id);
  ok(`Fabrics: ${fabricIds.join(", ")}`);

  const styles = await sql`SELECT id, brand FROM styles LIMIT 5`;
  if (!styles.length) fail("No styles found");
  const erthStyle  = styles.find((s: { brand: string }) => s.brand === "ERTH")   ?? styles[0];
  const sakkbaStyle = styles.find((s: { brand: string }) => s.brand === "SAKKBA") ?? styles[0];
  ok(`Styles → ERTH: ${erthStyle.id}, SAKKBA: ${sakkbaStyle.id}`);

  // ═══════════════════════════════════════════════════════════════════════════
  //  INCOMING ORDERS (trip=1, location=transit_to_workshop)
  // ═══════════════════════════════════════════════════════════════════════════
  log("═══ INCOMING (trip=1) ═══");

  // ── Scenario A: ERTH — 2B + 2F, mixed express/soak, two delivery dates ───
  log("A: ERTH — B1(express+soak,del+7) B2(soak,del+14) F1(express,del+7) F2(del+14)");
  const custA = await createCustomer("Ahmed Al-Rashidi",  "55501001");
  const measA = await createMeasurement(custA, staff.id);
  const { orderId: oA, garmentUuids: uA } = await createConfirmedOrder(
    "ERTH", custA, staff.id, measA, fabricIds, erthStyle.id, false,
    [
      { type: "brova", express: true,  soaking: true,  deliveryDays: 7  },
      { type: "brova", express: false, soaking: true,  deliveryDays: 14 },
      { type: "final", express: true,  soaking: false, deliveryDays: 7  },
      { type: "final", express: false, soaking: false, deliveryDays: 14 },
    ],
  );
  // Dispatch → all garments transit_to_workshop trip=1
  await dispatchOrder(oA, uA);
  ok(`Order A: #${oA} — dispatched to workshop (trip=1)`);

  // ── Scenario B: SAKKBA — 1B express + 1F, OVERDUE ────────────────────────
  log("B: SAKKBA — B1(express,del-2) F1(del-2), OVERDUE");
  const custB = await createCustomer("Yousef Al-Mansouri", "55502002");
  const measB = await createMeasurement(custB, staff.id);
  const { orderId: oB, garmentUuids: uB } = await createConfirmedOrder(
    "SAKKBA", custB, staff.id, measB, fabricIds, sakkbaStyle.id, false,
    [
      { type: "brova", express: true,  soaking: false, deliveryDays: -2 },
      { type: "final", express: true,  soaking: false, deliveryDays: -2 },
    ],
  );
  await dispatchOrder(oB, uB);
  ok(`Order B: #${oB} — dispatched (OVERDUE)`);

  // ── Scenario C: ERTH — 3B only, different express/soak/delivery, home delivery ──
  log("C: ERTH — B1(del+10) B2(soak,del+10) B3(express,del+5), home delivery");
  const custC = await createCustomer("Mohammed Al-Mutairi", "55503003");
  const measC = await createMeasurement(custC, staff.id);
  const { orderId: oC, garmentUuids: uC } = await createConfirmedOrder(
    "ERTH", custC, staff.id, measC, fabricIds, erthStyle.id, true,
    [
      { type: "brova", express: false, soaking: false, deliveryDays: 10 },
      { type: "brova", express: false, soaking: true,  deliveryDays: 10 },
      { type: "brova", express: true,  soaking: false, deliveryDays: 5  },
    ],
  );
  await dispatchOrder(oC, uC);
  ok(`Order C: #${oC} — dispatched (home delivery)`);

  // ═══════════════════════════════════════════════════════════════════════════
  //  BROVA RETURNS (trip=2) — full lifecycle for D & E
  // ═══════════════════════════════════════════════════════════════════════════
  log("═══ BROVA RETURNS (trip=2) — full cycle ═══");

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario D: ERTH — 2B+2F, both brovas rejected → trip=2, finals parked
  // Lifecycle: create → dispatch → rcv&start → production → wkshp→shop →
  //            shop rcv → trial(both rejected) → return to workshop(trip=2)
  // ──────────────────────────────────────────────────────────────────────────
  log("D: ERTH — 2B(B1 soak+del+10, B2 del+10) + 2F(del+10), both rejected → trip=2");
  const custD = await createCustomer("Faisal Al-Harbi",   "55504004");
  const measD = await createMeasurement(custD, staff.id);
  const { orderId: oD, garmentUuids: uD } = await createConfirmedOrder(
    "ERTH", custD, staff.id, measD, fabricIds, erthStyle.id, false,
    [
      { type: "brova", express: false, soaking: true,  deliveryDays: 10 },
      { type: "brova", express: false, soaking: false, deliveryDays: 10 },
      { type: "final", express: false, soaking: false, deliveryDays: 10 },
      { type: "final", express: false, soaking: false, deliveryDays: 10 },
    ],
  );
  const [dB1, dB2, dF1, dF2] = uD;

  // Step 2: Dispatch to workshop
  await dispatchOrder(oD, uD);
  ok(`  D: dispatched to workshop`);

  // Step 3: Workshop receive & start (brovas start, finals park)
  await receiveAndStartGarments(uD);
  ok(`  D: workshop received & started`);

  // Step 4: Production — brovas to ready_for_dispatch
  await completeProduction([dB1, dB2]);
  ok(`  D: brovas at ready_for_dispatch`);

  // Step 5: Workshop dispatches only brovas to shop
  await workshopDispatchToShop(oD, [dB1, dB2]);
  ok(`  D: brovas dispatched to shop`);

  // Step 6: Shop receives brovas
  await shopReceive([dB1, dB2]);
  ok(`  D: shop received brovas → awaiting_trial`);

  // Step 7: Brova trial — both rejected (needs_repair_rejected)
  // State for evaluateBrovaFeedback: both brovas at awaiting_trial, no acceptance_status yet
  const dBrovaState1 = [
    { id: dB1, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
    { id: dB2, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
  ];
  const rD1 = await submitBrovaFeedback(dB1, oD, staff.id, "needs_repair_rejected", dBrovaState1,
    "Collar width too wide, sleeve 1.5cm too long", 1);
  ok(`  D: B1 trialed → ${rD1.feedbackStatus}, releaseFinals=${rD1.releaseFinals}`);

  // Update state for B2 evaluation (B1 now has acceptance_status=false)
  const dBrovaState2 = [
    { id: dB1, piece_stage: "brova_trialed", acceptance_status: rD1.acceptanceStatus, feedback_status: rD1.feedbackStatus },
    { id: dB2, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
  ];
  const rD2 = await submitBrovaFeedback(dB2, oD, staff.id, "needs_repair_rejected", dBrovaState2,
    "Front pocket placement off, waist needs taking in", 1);
  ok(`  D: B2 trialed → ${rD2.feedbackStatus}, releaseFinals=${rD2.releaseFinals}`);

  // Step 8: Return both brovas to workshop (trip 1→2)
  await returnBrovaToWorkshop(dB1, oD, 1);
  await returnBrovaToWorkshop(dB2, oD, 1);
  ok(`  D: both brovas returned to workshop → trip=2, transit_to_workshop`);
  // Finals: still at workshop, waiting_for_acceptance (never released — no brova accepted)
  ok(`  D: finals stay parked at workshop (waiting_for_acceptance)`);
  ok(`Order D: #${oD} ✓`);

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario E: ERTH — 2B+2F, B1 needs_repair_accepted, B2 needs_repair_rejected
  //             → B1 at shop (later sent back), B2 returned, finals released
  // ──────────────────────────────────────────────────────────────────────────
  log("E: ERTH — B1(express+del+12) B2(soak+del+12) + 2F(del+12), mixed feedback → trip=2");
  const custE = await createCustomer("Khalid Al-Anzi",    "55505005");
  const measE = await createMeasurement(custE, staff.id);
  const { orderId: oE, garmentUuids: uE } = await createConfirmedOrder(
    "ERTH", custE, staff.id, measE, fabricIds, erthStyle.id, false,
    [
      { type: "brova", express: true,  soaking: false, deliveryDays: 12 },
      { type: "brova", express: false, soaking: true,  deliveryDays: 12 },
      { type: "final", express: true,  soaking: false, deliveryDays: 12 },
      { type: "final", express: false, soaking: false, deliveryDays: 12 },
    ],
  );
  const [eB1, eB2, eF1, eF2] = uE;

  await dispatchOrder(oE, uE);
  await receiveAndStartGarments(uE);
  await completeProduction([eB1, eB2]);
  await workshopDispatchToShop(oE, [eB1, eB2]);
  await shopReceive([eB1, eB2]);
  ok(`  E: brovas at shop → awaiting_trial`);

  // B1: needs_repair_accepted (accepted, finals can start, brova stays at shop for now)
  const eBrovaState1 = [
    { id: eB1, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
    { id: eB2, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
  ];
  const rE1 = await submitBrovaFeedback(eB1, oE, staff.id, "needs_repair_accepted", eBrovaState1,
    "Good fit overall, minor collar tuck needed — sending back for small fix", 1);
  ok(`  E: B1 → ${rE1.feedbackStatus}, accepted=${rE1.acceptanceStatus}, releaseFinals=${rE1.releaseFinals}`);

  // B2: needs_repair_rejected (B1 was accepted so releaseFinals=true for B2 too)
  const eBrovaState2 = [
    { id: eB1, piece_stage: "brova_trialed", acceptance_status: rE1.acceptanceStatus, feedback_status: rE1.feedbackStatus },
    { id: eB2, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
  ];
  const rE2 = await submitBrovaFeedback(eB2, oE, staff.id, "needs_repair_rejected", eBrovaState2,
    "Shoulder seam uneven, elbow too wide", 1);
  ok(`  E: B2 → ${rE2.feedbackStatus}, accepted=${rE2.acceptanceStatus}, releaseFinals=${rE2.releaseFinals}`);

  // Release finals (B1 accepted → releaseFinals=true)
  await releaseFinals([eF1, eF2]);
  ok(`  E: finals released → waiting_cut at workshop`);

  // Both brovas go back to workshop (trip 1→2)
  // B1 was needs_repair_accepted (stayed at shop), staff manually sends it back
  // B2 was needs_repair_rejected (goes back as well)
  await returnBrovaToWorkshop(eB1, oE, 1);
  await returnBrovaToWorkshop(eB2, oE, 1);
  ok(`  E: both brovas returned → trip=2, transit_to_workshop`);
  ok(`Order E: #${oE} ✓`);

  // ═══════════════════════════════════════════════════════════════════════════
  //  BROVA RETURNS (trip=3) — two full trial cycles for F
  // ═══════════════════════════════════════════════════════════════════════════
  log("═══ BROVA RETURNS (trip=3) — two full trial cycles ═══");

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario F: SAKKBA — 2B+2F
  //   Trip 1: both rejected (needs_repair_rejected) → trip=2
  //   Trip 2: both accepted with repair (needs_repair_accepted) → releaseFinals, trip=3
  //   Finals advanced to sewing at workshop
  // ──────────────────────────────────────────────────────────────────────────
  log("F: SAKKBA — B1(express+del+5) B2(del+5) + 2F(del+5), trip1 rejected → trip2 accepted → trip=3");
  const custF = await createCustomer("Nasser Al-Shammari", "55506006");
  const measF = await createMeasurement(custF, staff.id);
  const { orderId: oF, garmentUuids: uF } = await createConfirmedOrder(
    "SAKKBA", custF, staff.id, measF, fabricIds, sakkbaStyle.id, false,
    [
      { type: "brova", express: true,  soaking: false, deliveryDays: 5 },
      { type: "brova", express: false, soaking: false, deliveryDays: 5 },
      { type: "final", express: true,  soaking: false, deliveryDays: 5 },
      { type: "final", express: false, soaking: false, deliveryDays: 5 },
    ],
  );
  const [fB1, fB2, fF1, fF2] = uF;

  // ── Trip 1 cycle ──
  await dispatchOrder(oF, uF);
  await receiveAndStartGarments(uF);
  await completeProduction([fB1, fB2]);
  await workshopDispatchToShop(oF, [fB1, fB2]);
  await shopReceive([fB1, fB2]);
  ok(`  F: trip-1 brovas at shop → awaiting_trial`);

  // Trip 1 trial — both rejected
  const fBrovaState1a = [
    { id: fB1, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
    { id: fB2, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
  ];
  const rF1a = await submitBrovaFeedback(fB1, oF, staff.id, "needs_repair_rejected", fBrovaState1a,
    "Collar height too short, armhole too tight", 1);

  const fBrovaState1b = [
    { id: fB1, piece_stage: "brova_trialed", acceptance_status: rF1a.acceptanceStatus, feedback_status: rF1a.feedbackStatus },
    { id: fB2, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
  ];
  const rF1b = await submitBrovaFeedback(fB2, oF, staff.id, "needs_repair_rejected", fBrovaState1b,
    "Chest circumference too tight by 2cm", 1);
  ok(`  F: trip-1 trial → B1=${rF1a.feedbackStatus}, B2=${rF1b.feedbackStatus}, releaseFinals=${rF1b.releaseFinals}`);

  // Return both brovas (trip 1→2)
  await returnBrovaToWorkshop(fB1, oF, 1);
  await returnBrovaToWorkshop(fB2, oF, 1);
  ok(`  F: trip-1 brovas returned → trip=2`);

  // ── Trip 2 cycle ──
  await receiveAndStartGarments([fB1, fB2]);
  await completeProduction([fB1, fB2]);
  await workshopDispatchToShop(oF, [fB1, fB2]);
  await shopReceive([fB1, fB2]);
  ok(`  F: trip-2 brovas at shop → awaiting_trial`);

  // Trip 2 trial — both accepted with minor fix (releaseFinals=true)
  const fBrovaState2a = [
    { id: fB1, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
    { id: fB2, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
  ];
  const rF2a = await submitBrovaFeedback(fB1, oF, staff.id, "needs_repair_accepted", fBrovaState2a,
    "Collar improved, minor sleeve tuck still needed", 2);

  const fBrovaState2b = [
    { id: fB1, piece_stage: "brova_trialed", acceptance_status: rF2a.acceptanceStatus, feedback_status: rF2a.feedbackStatus },
    { id: fB2, piece_stage: "awaiting_trial", acceptance_status: null, feedback_status: null },
  ];
  const rF2b = await submitBrovaFeedback(fB2, oF, staff.id, "needs_repair_accepted", fBrovaState2b,
    "Good fit now, small waist adjustment requested", 2);
  ok(`  F: trip-2 trial → B1=${rF2a.feedbackStatus}, B2=${rF2b.feedbackStatus}, releaseFinals=${rF2b.releaseFinals}`);

  // Release finals (B1 accepted on trip 2 → releaseFinals=true)
  await releaseFinals([fF1, fF2]);
  ok(`  F: finals released → waiting_cut`);

  // Advance finals to sewing (simulates workshop scheduler picking them up and progressing)
  await advanceFinalsToStage([fF1, fF2], "sewing");
  ok(`  F: finals advanced to sewing`);

  // Return both brovas (trip 2→3)
  await returnBrovaToWorkshop(fB1, oF, 2);
  await returnBrovaToWorkshop(fB2, oF, 2);
  ok(`  F: trip-2 brovas returned → trip=3, transit_to_workshop`);
  ok(`Order F: #${oF} ✓`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║  Workshop Receiving Seed — Summary                                          ║");
  console.log("╠══════════════════════════════════════════════════════════════════════════════╣");
  console.log(`║  INCOMING (trip=1, transit_to_workshop):                                    ║`);
  console.log(`║    A. #${String(oA).padEnd(6)} ERTH   2B(exp+soak/soak) + 2F   del +7/+14d       ║`);
  console.log(`║    B. #${String(oB).padEnd(6)} SAKKBA 1B express + 1F          OVERDUE            ║`);
  console.log(`║    C. #${String(oC).padEnd(6)} ERTH   3B(soak/exp/normal)      home del +5/+10d   ║`);
  console.log(`║  BROVA RETURNS (trip=2, transit_to_workshop):                               ║`);
  console.log(`║    D. #${String(oD).padEnd(6)} ERTH   2B rejected, 2F parked at workshop    ║`);
  console.log(`║    E. #${String(oE).padEnd(6)} ERTH   2B mixed, 2F released (waiting_cut)   ║`);
  console.log(`║  BROVA RETURNS (trip=3, transit_to_workshop):                               ║`);
  console.log(`║    F. #${String(oF).padEnd(6)} SAKKBA 2B trip-3, 2F at sewing               ║`);
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  await sql.end();
  log("✅ Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
