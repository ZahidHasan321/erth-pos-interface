/**
 * Seed-create a confirmed, unpaid, ONE-final WORK order via the real lifecycle
 * RPCs against the LOCAL DB (committed — not a rolled-back tx).
 *
 * WHY RPC, NOT THE UI: the shop new-work-order form is genuinely brittle for an
 * e2e click-through (the measurement grid has no addressable inputs and a
 * required signature CANVAS blocks submit). So order CREATION is seeded; every
 * lifecycle TRANSITION after it is driven through the real UI (or the production
 * chain via the shared driver — see lifecycle-initial.spec.ts). The three calls
 * exactly mirror packages/database/scripts/lifecycle/driver.ts createWorkOrder:
 *   1. INSERT orders (draft) + work_orders (order_phase 'new')   [createOrder]
 *   2. save_work_order_garments(orderId, garments, orderUpdates)  [Phase B]
 *   3. complete_work_order(orderId, checkoutDetails, [], fabrics, key)  [Phase C]
 *      with paid:0, deferToCashier:true → confirmed, unpaid, pending cashier.
 *
 * Result invariants (asserted by the caller):
 *   orders.checkout_status='confirmed', paid=0
 *   work_orders.cashier_processed_at IS NULL  (the §3 dispatch gate)
 *   the single garment: garment_type='final', piece_stage='waiting_cut',
 *                       location='shop', trip_number=0
 *
 * Pinned seed fixtures (see scripts/seed-users.ts): customer 1, fabric 1, style 1.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { BRAND } from "../config";

const CUSTOMER_ID = 1;
const FABRIC_ID = 1;
const STYLE_ID = 1;
const BRAND_UPPER = BRAND.toUpperCase(); // brand column stores upper-case.

export interface SeededOrder {
  orderId: number;
  invoiceNumber: number;
  /** The single final garment's UUID (garments.id). */
  garmentUuid: string;
  /** Its human garment_id ("1"). */
  garmentCode: string;
}

/** Resolve the seeded order-taker's UUID (its id IS its auth id). */
async function orderTakerId(): Promise<string> {
  const sql = getDb();
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE username = 'e2e_ordertaker'
  `;
  if (!row) throw new Error("seed-order: e2e_ordertaker user not found (run pnpm e2e:setup)");
  return row.id;
}

/**
 * Create one confirmed, unpaid WORK order with a single final garment.
 * Returns the ids the spec needs to target rows in each UI.
 */
export async function seedConfirmedWorkOrderWithFinal(): Promise<SeededOrder> {
  const sql = getDb();
  const taker = await orderTakerId();

  // ── 1. createOrder — orders (draft) + work_orders (order_phase 'new') ──
  const [o] = await sql<{ id: number }[]>`
    INSERT INTO orders (customer_id, brand, checkout_status, order_type, order_taker_id)
    VALUES (${CUSTOMER_ID}, ${BRAND_UPPER}::brand, 'draft', 'WORK', ${taker})
    RETURNING id
  `;
  const orderId = o!.id;
  await sql`INSERT INTO work_orders (order_id, order_phase) VALUES (${orderId}, 'new')`;

  // ── 2. save_work_order_garments — one final ──
  const garmentsJson = [
    {
      garment_id: "1",
      fabric_id: FABRIC_ID,
      style_id: STYLE_ID,
      fabric_source: "IN",
      fabric_length: 3,
      fabric_price_snapshot: 15,
      stitching_price_snapshot: 10,
      style_price_snapshot: 3,
      garment_type: "final",
      express: false,
      soaking: false,
    },
  ];
  await sql`
    SELECT save_work_order_garments(
      ${orderId},
      ${sql.json(garmentsJson)}::jsonb,
      ${sql.json({
        num_of_fabrics: 1,
        fabric_charge: 45,
        stitching_charge: 30,
        style_charge: 9,
        stitching_price: 10,
        home_delivery: false,
      })}::jsonb
    )
  `;

  // ── 3. complete_work_order — paid:0, deferToCashier:true ──
  await sql`
    SELECT complete_work_order(
      ${orderId},
      ${sql.json({
        paymentType: "cash",
        paid: 0,
        orderTaker: taker,
        discountType: "flat",
        discountValue: 0,
        discountPercentage: 0,
        referralCode: null,
        orderTotal: 84,
        fabricCharge: 45,
        stitchingCharge: 30,
        styleCharge: 9,
        deliveryCharge: 0,
        expressCharge: 0,
        soakingCharge: 0,
        shelfCharge: 0,
        homeDelivery: false,
        deliveryDate: null,
        advance: 0,
        stitchingPrice: 10,
        deferToCashier: true,
      })}::jsonb,
      '[]'::jsonb,
      ${sql.json([{ id: FABRIC_ID, length: 3 }])}::jsonb,
      ${randomUUID()}::uuid
    )
  `;

  // Capture the garment uuid + invoice number for UI row-targeting.
  const [g] = await sql<{ id: string; garment_id: string }[]>`
    SELECT id, garment_id FROM garments WHERE order_id = ${orderId} ORDER BY garment_id LIMIT 1
  `;
  const [w] = await sql<{ invoice_number: number }[]>`
    SELECT invoice_number FROM work_orders WHERE order_id = ${orderId}
  `;
  if (!g) throw new Error(`seed-order: no garment created for order ${orderId}`);
  if (!w?.invoice_number) throw new Error(`seed-order: no invoice_number on order ${orderId}`);

  return {
    orderId,
    invoiceNumber: w.invoice_number,
    garmentUuid: g.id,
    garmentCode: g.garment_id,
  };
}
