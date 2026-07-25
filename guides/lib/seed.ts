/**
 * Guide-owned seeding.
 *
 * Separate from e2e/helpers/seed-order.ts on purpose. The e2e seeder exists to
 * satisfy assertions, so "Test Customer" and a bare one-garment order are exactly
 * right for it. A GUIDE is read by staff, so its data has to look like a real
 * day at the shop: a plausible customer, a clean queue, stable invoice numbers.
 * Those goals conflict, and the e2e suite asserts on its own fixture strings, so
 * the guide seeds its own rather than bending theirs.
 *
 * LOCAL ONLY. The connection comes from e2e/config.ts, which is hardcoded to the
 * local Supabase stack and can never point at prod.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../../e2e/helpers/db";
import { BRAND } from "../../e2e/config";

const FABRIC_ID = 1;
const STYLE_ID = 1;
const BRAND_UPPER = BRAND.toUpperCase();

/** The customer the whole guide follows. One person, one story. */
export const GUIDE_CUSTOMER = {
  name: "Yousef Al-Mutairi",
  phone: "55512345",
  countryCode: "+965",
} as const;

export interface GuideOrder {
  orderId: number;
  invoiceNumber: number;
  garmentUuid: string;
  customerId: number;
  customerName: string;
}

/**
 * Wipe every order so the guide's screenshots show a queue with exactly the
 * orders the guide is about.
 *
 * Without this, each run leaves its order behind and the Pending queue fills with
 * near-identical rows — after five runs the cashier chapter shows five customers
 * with the same name and price, which teaches a reader nothing and looks broken.
 * CASCADE follows the FKs that point AT orders (work_orders, garments, payments);
 * fabrics, styles and users are referenced BY orders and are untouched.
 */
export async function resetOrders(): Promise<void> {
  const sql = getDb();
  await sql`TRUNCATE TABLE orders RESTART IDENTITY CASCADE`;
  // Invoice numbers come from a sequence, not from orders.id, so the truncate
  // above does not reset them. Put it back to 1 so the guide's screenshots show
  // low, stable invoice numbers instead of drifting up on every capture.
  await sql`
    SELECT setval(pg_get_serial_sequence('work_orders','invoice_number'), 1, false)
    WHERE pg_get_serial_sequence('work_orders','invoice_number') IS NOT NULL
  `.catch(() => {
    /* sequence not owned by the column on this schema — invoice numbers just drift */
  });
}

/** Create (or reuse) the customer the guide follows. */
export async function ensureGuideCustomer(): Promise<number> {
  const sql = getDb();
  const [existing] = await sql<{ id: number }[]>`
    SELECT id FROM customers WHERE phone = ${GUIDE_CUSTOMER.phone} LIMIT 1
  `;
  if (existing) return existing.id;

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO customers (name, phone, country_code, account_type)
    VALUES (${GUIDE_CUSTOMER.name}, ${GUIDE_CUSTOMER.phone}, ${GUIDE_CUSTOMER.countryCode}, 'Primary')
    RETURNING id
  `;
  if (!row) throw new Error("seed: could not create the guide customer");
  return row.id;
}

async function orderTakerId(): Promise<string> {
  const sql = getDb();
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE username = 'e2e_ordertaker'
  `;
  if (!row) throw new Error("seed: e2e_ordertaker not found (run pnpm e2e:setup)");
  return row.id;
}

/**
 * One confirmed, unpaid WORK order with a single final garment, for the guide's
 * customer. Mirrors the three real lifecycle RPCs (create → save garments →
 * complete with deferToCashier), so the row lands in exactly the state the shop
 * produces: confirmed, unpaid, pending cashier, garment at the shop on trip 0.
 */
export async function seedGuideOrder(customerId: number): Promise<GuideOrder> {
  const sql = getDb();
  const taker = await orderTakerId();

  const [o] = await sql<{ id: number }[]>`
    INSERT INTO orders (customer_id, brand, checkout_status, order_type, order_taker_id)
    VALUES (${customerId}, ${BRAND_UPPER}::brand, 'draft', 'WORK', ${taker})
    RETURNING id
  `;
  const orderId = o!.id;
  await sql`INSERT INTO work_orders (order_id, order_phase) VALUES (${orderId}, 'new')`;

  await sql`
    SELECT save_work_order_garments(
      ${orderId},
      ${sql.json([
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
      ])}::jsonb,
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

  const [g] = await sql<{ id: string }[]>`
    SELECT id FROM garments WHERE order_id = ${orderId} ORDER BY garment_id LIMIT 1
  `;
  const [w] = await sql<{ invoice_number: number }[]>`
    SELECT invoice_number FROM work_orders WHERE order_id = ${orderId}
  `;
  if (!g) throw new Error(`seed: no garment created for order ${orderId}`);
  if (!w?.invoice_number) throw new Error(`seed: no invoice_number on order ${orderId}`);

  return {
    orderId,
    invoiceNumber: w.invoice_number,
    garmentUuid: g.id,
    customerId,
    customerName: GUIDE_CUSTOMER.name,
  };
}

/** Reset, ensure the customer, seed the order the guide follows. */
export async function freshGuideOrder(): Promise<GuideOrder> {
  await resetOrders();
  const customerId = await ensureGuideCustomer();
  return seedGuideOrder(customerId);
}
