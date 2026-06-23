/**
 * Workflow driver: drives a garment order through the real lifecycle inside a
 * test transaction.
 *
 *  - DB RPCs (save_work_order_garments, complete_work_order,
 *    record_payment_transaction, toggle_home_delivery, collect_garments,
 *    create_complete_sales_order) are called directly — the real deployed code.
 *  - Steps that live in the app's Supabase api layer (dispatch, receive,
 *    production chain, QC, shop-receive, feedback persistence, send-back,
 *    replacement) are reproduced here as the EXACT same column mutations the
 *    app issues. Each mirrored op cites its source file:line so drift is
 *    auditable.
 *
 * Brova-feedback verdict logic uses the real `evaluateBrovaFeedback` from
 * src/utils.ts (not reimplemented).
 */
import { randomUUID } from "node:crypto";
import type { Tx } from "./db";
import { actAs, only } from "./db";
import { evaluateBrovaFeedback, type BrovaFeedback } from "../../src/utils";
// Real QC verdict logic the workshop app runs (pure: only depends on
// @repo/database). Importing it makes the QC pass/fail decision genuinely
// under test instead of a driver-supplied boolean.
import { evaluateQc } from "../../../../apps/workshop/src/lib/qc-spec";
// Real final-garment feedback decision tree the POS feedback page runs (pure).
// Importing it makes finalCollect/finalReject exercise production logic, not a
// hand-mirrored copy.
import { buildFinalGarmentPayload } from "../../../../apps/pos-interface/src/lib/feedback-payload";
// Real workshop QC/schedule decision logic the workshop app runs (pure, no
// runtime "@/" alias deps — see production-logic.ts header). Importing these
// makes the driver's QC persistence decisions exercise production code, not a
// hand-mirrored copy.
import {
  orderQcReturnStages,
  resolveQcOutcome,
  computeQcAttemptNumber,
} from "../../../../apps/workshop/src/lib/production-logic";
import {
  ORDER_TAKER,
  CASHIER,
  MANAGER,
  BRAND,
  CUSTOMER_ID,
  FABRIC_A_ID,
  STYLE_ID,
  SHELF_A_ID,
} from "./fixtures";

// Production chain order (post_cutting disabled, soaking is a parallel track).
export const PROD_STAGES = [
  "cutting",
  "sewing",
  "finishing",
  "ironing",
  "quality_check",
] as const;
export type ProdStage = (typeof PROD_STAGES)[number];

export interface GarmentSpec {
  garment_type: "brova" | "final" | "alteration";
  fabric_id?: number;
  style_id?: number;
  fabric_length?: number;
  /** price snapshots — drive refund "fully refunded ⇒ discarded" logic */
  fabric_price?: number;
  stitching_price?: number;
  style_price?: number;
  express?: boolean;
  soaking?: boolean;
}

export interface GarmentRow {
  id: string;
  garment_id: string;
  garment_type: string;
  piece_stage: string;
  location: string;
  trip_number: number;
  acceptance_status: boolean | null;
  feedback_status: string | null;
  fulfillment_type: string | null;
  in_production: boolean | null;
  home_delivery: boolean | null;
  replaced_by_garment_id: string | null;
  trip_history:
    | Array<{
        trip: number;
        qc_attempts?: Array<{
          result: string;
          trip?: number;
          attempt_number?: number;
          return_stages?: string[] | null;
          failed_measurements?: string[];
          failed_options?: string[];
          failed_quality?: string[];
        }>;
      }>
    | null;
  qc_rework_stages: string[] | null;
}

export async function getGarments(tx: Tx, orderId: number): Promise<GarmentRow[]> {
  return (await tx`
    SELECT id, garment_id, garment_type, piece_stage, location, trip_number,
           acceptance_status, feedback_status, fulfillment_type, in_production,
           home_delivery, replaced_by_garment_id, trip_history, qc_rework_stages
    FROM garments WHERE order_id = ${orderId}
    -- WORK ids are plain ints ("3"); ALTERATION ids are composite
    -- ("<invoice>-<n>", alteration-orders.ts:179). Order by the trailing
    -- numeric segment so both shapes sort correctly (and "10" > "2").
    ORDER BY (regexp_replace(garment_id, '^.*-', ''))::int
  `) as unknown as GarmentRow[];
}

export interface OrderRow {
  id: number;
  checkout_status: string;
  order_type: string;
  paid: string | null;
  order_total: string | null;
  delivery_charge: string | null;
  order_phase: string | null;
  invoice_number: number | null;
  home_delivery: boolean | null;
}

export async function getOrder(tx: Tx, orderId: number): Promise<OrderRow> {
  const [o] = await tx`
    SELECT o.id, o.checkout_status, o.order_type, o.paid, o.order_total,
           o.delivery_charge, w.order_phase, w.invoice_number, w.home_delivery
    FROM orders o LEFT JOIN work_orders w ON w.order_id = o.id
    WHERE o.id = ${orderId}
  `;
  if (!o) throw new Error(`getOrder: order ${orderId} not found`);
  return o as unknown as OrderRow;
}

// ─── Phase A+B+C: create → save garments → confirm ──────────────────────────

/**
 * createOrder (apps/pos-interface/src/api/orders.ts:418) — minimal mirror:
 * insert orders (draft) + work_orders (order_phase 'new').
 */
export async function createOrder(tx: Tx): Promise<number> {
  const o = only(
    await tx`
      INSERT INTO orders (customer_id, brand, checkout_status, order_type, order_taker_id)
      VALUES (${CUSTOMER_ID}, ${BRAND}::brand, 'draft', 'WORK', ${ORDER_TAKER.id})
      RETURNING id
    `,
    "createOrder",
  );
  await tx`
    INSERT INTO work_orders (order_id, order_phase) VALUES (${o.id}, 'new')
  `;
  return o.id as number;
}

/**
 * Phase B (save_work_order_garments RPC) + Phase C (complete_work_order RPC).
 * `paid` controls the cashier split: paid=0 ⇒ order lands in the cashier
 * queue (confirmed & unpaid); paid=full ⇒ inline payment at order-taking.
 */
/**
 * Phase B only — save_work_order_garments RPC. Split out of createWorkOrder so
 * an idempotency test can drive an order up to (but not through) the confirm
 * step, then call completeWorkOrder twice with one key.
 */
export async function saveWorkOrderGarments(
  tx: Tx,
  orderId: number,
  specs: GarmentSpec[],
) {
  const garmentsJson = specs.map((s, i) => ({
    garment_id: String(i + 1),
    fabric_id: s.fabric_id ?? FABRIC_A_ID,
    style_id: s.style_id ?? STYLE_ID,
    fabric_source: "IN",
    fabric_length: s.fabric_length ?? 3,
    fabric_price_snapshot: s.fabric_price ?? 15,
    stitching_price_snapshot: s.stitching_price ?? 10,
    style_price_snapshot: s.style_price ?? 3,
    garment_type: s.garment_type,
    express: s.express ?? false,
    soaking: s.soaking ?? false,
  }));

  await tx`
    SELECT save_work_order_garments(
      ${orderId},
      ${tx.json(garmentsJson)}::jsonb,
      ${tx.json({ num_of_fabrics: specs.length, fabric_charge: 45, stitching_charge: 30, style_charge: 9, stitching_price: 10, home_delivery: false })}::jsonb
    )
  `;
}

/**
 * Phase C only — complete_work_order RPC. `idempotencyKey` defaults to a fresh
 * UUID (one-shot, as before); pass a FIXED key and call twice to exercise the
 * idem_claim / idem_replay path (triggers.sql:128).
 */
export async function completeWorkOrder(
  tx: Tx,
  orderId: number,
  specs: GarmentSpec[],
  opts: { paid?: number; idempotencyKey?: string; deferToCashier?: boolean } = {},
) {
  const orderTotal = 84;
  // ERTH is the deferred-cashier brand (the brand this suite models), so the
  // honest default is deferToCashier=true → the order is "pending cashier
  // processing" after confirm and must be processed before dispatch (§3).
  // Pass deferToCashier=false to model an inline-payment brand (processed at
  // confirmation).
  const deferToCashier = opts.deferToCashier ?? true;
  const res = only(
    await tx`
    SELECT complete_work_order(
      ${orderId},
      ${tx.json({
        paymentType: "cash",
        paid: opts.paid ?? 0,
        orderTaker: ORDER_TAKER.id,
        discountType: "flat",
        discountValue: 0,
        discountPercentage: 0,
        referralCode: null,
        orderTotal,
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
        deferToCashier,
      })}::jsonb,
      '[]'::jsonb,
      ${tx.json(specs.map(() => ({ id: FABRIC_A_ID, length: 3 })))}::jsonb,
      ${opts.idempotencyKey ?? randomUUID()}::uuid
    ) AS r
  `,
    "complete_work_order",
  );
  return res.r;
}

export async function createWorkOrder(
  tx: Tx,
  specs: GarmentSpec[],
  opts: { paid?: number; deferToCashier?: boolean } = {},
): Promise<{ orderId: number; garments: GarmentRow[] }> {
  const orderId = await createOrder(tx);
  await saveWorkOrderGarments(tx, orderId, specs);
  await completeWorkOrder(tx, orderId, specs, {
    paid: opts.paid ?? 0,
    deferToCashier: opts.deferToCashier,
  });
  return { orderId, garments: await getGarments(tx, orderId) };
}

/**
 * reprice_order_styles RPC (SPEC §2.5) — persist a brova-trial style reprice:
 * absolute per-garment style snapshots + new aggregate style_charge + new
 * order_total. Audit-only; never touches orders.paid. `idempotencyKey` defaults
 * to a fresh UUID (one-shot); pass a FIXED key + call twice to exercise replay.
 */
export async function repriceOrderStyles(
  tx: Tx,
  orderId: number,
  params: {
    garments: { garment_id: string; style_price_snapshot: number }[];
    newStyleCharge: number;
    newOrderTotal: number;
    actor?: string | null;
    reason?: string | null;
    idempotencyKey?: string;
  },
) {
  const res = only(
    await tx`
      SELECT reprice_order_styles(
        ${orderId},
        ${tx.json(params.garments)}::jsonb,
        ${params.newStyleCharge},
        ${params.newOrderTotal},
        ${params.actor ?? null}::uuid,
        ${params.reason ?? null},
        ${params.idempotencyKey ?? randomUUID()}::uuid
      ) AS r
    `,
    "reprice_order_styles",
  );
  return res.r;
}

/** Style-price snapshots for an order's garments, keyed by garment_id. */
export async function getStyleSnapshots(
  tx: Tx,
  orderId: number,
): Promise<Record<string, number>> {
  const rows = (await tx`
    SELECT garment_id, style_price_snapshot FROM garments WHERE order_id = ${orderId}
  `) as unknown as { garment_id: string; style_price_snapshot: string | null }[];
  return Object.fromEntries(rows.map((r) => [r.garment_id, Number(r.style_price_snapshot) || 0]));
}

/** work_orders.style_charge for an order. */
export async function getStyleCharge(tx: Tx, orderId: number): Promise<number> {
  const [w] = await tx`SELECT style_charge FROM work_orders WHERE order_id = ${orderId}`;
  return Number((w as { style_charge: string | null } | undefined)?.style_charge) || 0;
}

/** work_orders.invoice_revision for an order (0 = the original invoice; §3). */
export async function getInvoiceRevision(tx: Tx, orderId: number): Promise<number> {
  const [w] = await tx`SELECT invoice_revision FROM work_orders WHERE order_id = ${orderId}`;
  return Number((w as { invoice_revision: number | string | null } | undefined)?.invoice_revision) || 0;
}

/**
 * bump_invoice_revision RPC (SPEC §3) — mint a revision with NO total change,
 * for a brova-trial style change the reprice found no price delta for. Idempotent
 * on its key; pass a FIXED key + call twice to exercise replay.
 */
export async function bumpInvoiceRevision(
  tx: Tx,
  orderId: number,
  params: { reason?: string | null; idempotencyKey?: string } = {},
) {
  const res = only(
    await tx`
      SELECT bump_invoice_revision(
        ${orderId},
        ${params.reason ?? null},
        ${params.idempotencyKey ?? randomUUID()}::uuid
      ) AS r
    `,
    "bump_invoice_revision",
  );
  return res.r;
}

/**
 * createAlterationOrder (apps/pos-interface/src/api/alteration-orders.ts:85-218).
 * Mirrors the three inserts the real app issues in sequence:
 *   1. orders (order_type='ALTERATION', checkout_status='confirmed')
 *   2. alteration_orders extension row (order_phase='new')
 *   3. garments (garment_type='alteration', piece_stage='waiting_cut', location='shop', trip_number=0)
 * No RPC — the app issues plain inserts for this order type.
 */
export async function createAlterationOrder(
  tx: Tx,
  specs: GarmentSpec[],
  opts: { paid?: number } = {},
): Promise<{ orderId: number; garments: GarmentRow[] }> {
  const o = only(
    await tx`
      INSERT INTO orders (customer_id, brand, checkout_status, order_type, order_taker_id, order_total)
      VALUES (${CUSTOMER_ID}, ${BRAND}::brand, 'confirmed', 'ALTERATION', ${ORDER_TAKER.id}, 50)
      RETURNING id
    `,
    "createAlterationOrder: orders",
  );
  const orderId = o.id as number;

  await tx`
    INSERT INTO alteration_orders (order_id, invoice_number, order_phase, alteration_total, received_date)
    VALUES (${orderId}, ${orderId}, 'new', 50, CURRENT_DATE)
  `;

  const garmentRows = specs.map((s, i) => ({
    order_id: orderId,
    garment_id: `${orderId}-${i + 1}`,
    garment_type: "alteration" as const,
    piece_stage: "waiting_cut" as const,
    location: "shop" as const,
    trip_number: 0,
    in_production: false,
    home_delivery: false,
    fabric_id: s.fabric_id ?? null,
    style_id: s.style_id ?? null,
  }));

  for (const row of garmentRows) {
    await tx`
      INSERT INTO garments (order_id, garment_id, garment_type, piece_stage, location,
                            trip_number, in_production, home_delivery, fabric_id, style_id)
      VALUES (${row.order_id}, ${row.garment_id}, ${row.garment_type}, ${row.piece_stage},
              ${row.location}, ${row.trip_number}, ${row.in_production}, ${row.home_delivery},
              ${row.fabric_id}, ${row.style_id})
    `;
  }

  if (opts.paid && opts.paid > 0) {
    await tx`
      INSERT INTO payment_transactions (order_id, amount, payment_type, transaction_type, transaction_date)
      VALUES (${orderId}, ${opts.paid}, 'cash', 'payment', CURRENT_DATE)
    `;
  }

  return { orderId, garments: await getGarments(tx, orderId) };
}

// ─── Cashier ────────────────────────────────────────────────────────────────

/** record_payment_transaction RPC (triggers.sql:885). Acts as the cashier. */
export async function recordPayment(
  tx: Tx,
  orderId: number,
  amount: number,
  opts: {
    collectGarmentIds?: string[];
    fulfillmentOverrides?: Record<string, string>;
    refund?: { reason: string; items?: Record<string, unknown>[] };
    idempotencyKey?: string;
  } = {},
) {
  await actAs(tx, CASHIER.id);
  const res = only(
    await tx`
    SELECT record_payment_transaction(
      ${orderId},
      ${amount},
      'cash',
      NULL, NULL,
      ${CASHIER.id}::uuid,
      ${opts.refund ? "refund" : "payment"},
      ${opts.refund?.reason ?? null},
      ${opts.collectGarmentIds ? tx.array(opts.collectGarmentIds) : null}::uuid[],
      ${opts.refund?.items ? tx.json(opts.refund.items as never) : null}::jsonb,
      CURRENT_DATE,
      ${opts.fulfillmentOverrides ? tx.json(opts.fulfillmentOverrides) : null}::jsonb,
      ${opts.idempotencyKey ?? randomUUID()}::uuid
    ) AS r
  `,
    "record_payment_transaction",
  );
  return res.r;
}

/** toggle_home_delivery RPC (triggers.sql:1189). */
export async function toggleHomeDelivery(tx: Tx, orderId: number, on: boolean) {
  const res = only(
    await tx`SELECT toggle_home_delivery(${orderId}, ${on}) AS r`,
    "toggle_home_delivery",
  );
  return res.r;
}

/** collect_garments RPC (triggers.sql:1251) — collect without a payment. */
export async function collectGarments(
  tx: Tx,
  orderId: number,
  garmentIds: string[],
  overrides?: Record<string, string>,
) {
  const res = only(
    await tx`
    SELECT collect_garments(
      ${orderId},
      ${tx.array(garmentIds)}::uuid[],
      ${overrides ? tx.json(overrides) : null}::jsonb
    ) AS r
  `,
    "collect_garments",
  );
  return res.r;
}

// ─── Dispatch / receive (app-layer mirrors) ─────────────────────────────────

/**
 * cashier_confirm_orders_no_payment RPC (triggers.sql) — the cashier clears a
 * WORK order's §3 processing gate WITHOUT taking payment. Acts as the cashier.
 * Idempotent and WORK-only (no-op on SALES/ALTERATION or already-processed
 * orders), so it is safe to call before any dispatch.
 */
export async function cashierProcess(tx: Tx, orderId: number) {
  await actAs(tx, CASHIER.id);
  const res = only(
    await tx`
    SELECT cashier_confirm_orders_no_payment(
      ${tx.array([orderId])}::int[],
      ${CASHIER.id}::uuid,
      ${randomUUID()}::uuid
    ) AS r
  `,
    "cashier_confirm_orders_no_payment",
  );
  return res.r;
}

/**
 * record_bulk_payment RPC (triggers.sql) — atomic, idempotent payment across
 * several WORK orders. Acts as the cashier. `payments` is the per-order amount
 * list; pass a FIXED key + call twice to exercise the batch replay path.
 */
export async function recordBulkPayment(
  tx: Tx,
  payments: { orderId: number; amount: number; paymentType?: string }[],
  opts: { idempotencyKey?: string } = {},
) {
  await actAs(tx, CASHIER.id);
  const res = only(
    await tx`
    SELECT record_bulk_payment(
      ${tx.json(payments)}::jsonb,
      ${CASHIER.id}::uuid,
      ${opts.idempotencyKey ?? randomUUID()}::uuid
    ) AS r
  `,
    "record_bulk_payment",
  );
  return res.r;
}

/**
 * dispatch_order RPC (triggers.sql:1307) — now the REAL deployed code, not
 * a mirror. apps/pos-interface/src/api/orders.ts dispatchOrder calls the
 * same function, so app and test exercise identical logic (no drift).
 *
 * A WORK order must be cashier-processed before dispatch (§3 gate). By default
 * this helper clears that gate first (confirm-without-payment) so the lifecycle
 * tests model the real "cashier processed → dispatched" flow without each site
 * repeating it. Pass { skipCashierProcess: true } to exercise the raw gate
 * (e.g. assert dispatch is rejected while still pending).
 */
export async function dispatchOrder(
  tx: Tx,
  orderId: number,
  garmentIds?: string[],
  opts: { skipCashierProcess?: boolean } = {},
) {
  if (!opts.skipCashierProcess) {
    await cashierProcess(tx, orderId);
  }
  await tx`
    SELECT dispatch_order(
      ${orderId},
      ${garmentIds ? tx.array(garmentIds) : null}::uuid[]
    )
  `;
}

/**
 * receive_garments RPC (triggers.sql:1370) — now the REAL deployed code, not
 * a mirror. apps/workshop/src/api/garments.ts receiveGarments (p_start=false)
 * and receiveAndStartGarments (p_start=true) call the same function, so app
 * and test exercise identical logic (no drift).
 */
export async function workshopReceive(
  tx: Tx,
  ids: string[],
  opts: { start?: boolean } = {},
) {
  await tx`
    SELECT receive_garments(${tx.array(ids)}::uuid[], ${opts.start ?? false})
  `;
}

/**
 * Production chain. Mirrors scheduleGarments + completeAndAdvance
 * (apps/workshop/src/api/garments.ts:1009 / :1118): waiting_cut → cutting →
 * sewing → finishing → ironing → quality_check. Stops at quality_check (QC is
 * a separate explicit step). Skips parked finals.
 */
export async function runProduction(tx: Tx, ids: string[]) {
  await tx`
    UPDATE garments
       SET piece_stage = 'cutting', in_production = true, qc_rework_stages = NULL
     WHERE id = ANY(${tx.array(ids)}::uuid[]) AND piece_stage = 'waiting_cut'
  `;
  for (let i = 1; i < PROD_STAGES.length; i++) {
    const next = PROD_STAGES[i]!;
    const prev = PROD_STAGES[i - 1]!;
    await tx`
      UPDATE garments
         SET piece_stage = ${next}, completion_time = NOW(), start_time = NULL
       WHERE id = ANY(${tx.array(ids)}::uuid[]) AND piece_stage = ${prev}
    `;
  }
}

/**
 * submitQc — manual-outcome QC helper. The pass/fail OUTCOME decision now runs
 * the REAL shared logic orderQcReturnStages + resolveQcOutcome
 * (apps/workshop/src/lib/production-logic.ts:194) — the same functions
 * apps/workshop submitQc calls. The trip_history qc_attempt accumulation +
 * UPDATE shape still mirror the app's submitQc persistence
 * (apps/workshop/src/api/garments.ts:1178). NO trip increment.
 */
export async function submitQc(
  tx: Tx,
  garmentId: string,
  outcome: { pass: true } | { pass: false; returnStages: ProdStage[] },
) {
  const g = only(
    await tx`
      SELECT trip_number, trip_history FROM garments WHERE id = ${garmentId}
    `,
    "submitQc",
  );
  const trip: number = g.trip_number ?? 1;
  type TripHist = NonNullable<GarmentRow["trip_history"]>;
  const history: TripHist = (g.trip_history as TripHist | null) ?? [];
  let entry = history.find((h) => h.trip === trip);
  if (!entry) {
    entry = { trip, qc_attempts: [] };
    history.push(entry);
  }
  entry.qc_attempts = entry.qc_attempts ?? [];

  const result: "pass" | "fail" = outcome.pass ? "pass" : "fail";
  const orderedStages = outcome.pass
    ? null
    : orderQcReturnStages(outcome.returnStages, PROD_STAGES);
  const { piece_stage, qc_rework_stages } = resolveQcOutcome(
    { result },
    orderedStages,
  );

  entry.qc_attempts.push({
    result,
    trip,
    attempt_number: computeQcAttemptNumber(
      entry as unknown as Parameters<typeof computeQcAttemptNumber>[0],
      trip,
    ),
    return_stages: orderedStages,
  });

  if (result === "pass") {
    await tx`
      UPDATE garments
         SET piece_stage = ${piece_stage}, completion_time = NOW(),
             start_time = NULL, qc_rework_stages = NULL,
             trip_history = ${tx.json(history)}::jsonb
       WHERE id = ${garmentId}
    `;
  } else {
    await tx`
      UPDATE garments
         SET piece_stage = ${piece_stage}, start_time = NULL,
             qc_rework_stages = ${tx.array(qc_rework_stages!)},
             trip_history = ${tx.json(history)}::jsonb
       WHERE id = ${garmentId}
    `;
  }
}

/**
 * QC driven end-to-end by REAL shared logic:
 *   - verdict: evaluateQc (apps/workshop/src/lib/qc-spec.ts:252)
 *   - outcome + return-stage ordering: orderQcReturnStages + resolveQcOutcome
 *     (apps/workshop/src/lib/production-logic.ts:194)
 * The trip_history qc_attempt accumulation + UPDATE shape still mirror the
 * app's submitQc persistence (apps/workshop/src/api/garments.ts:1275). The
 * recorded attempt carries the failed-key breadcrumb (failed_measurements /
 * failed_options / failed_quality) so the iterative rework loop — where each
 * round re-checks ONLY the previously-failed keys — is observable and
 * assertable. A regression in QC evaluation or outcome routing fails the suite.
 */
export async function submitQcReal(
  tx: Tx,
  garmentId: string,
  args: {
    expectedMeasurements: Record<string, unknown>;
    expectedOptions?: Record<string, unknown>;
    inputs: {
      measurements: Record<string, number>;
      options: Record<string, string | boolean | number | null>;
      quality_ratings: Record<string, number>;
    };
    enabledKeys: Set<string>;
    returnStagesOnFail?: ProdStage[];
  },
): Promise<{
  result: "pass" | "fail";
  failedKeys: string[];
}> {
  const evalResult = evaluateQc(
    args.expectedMeasurements,
    args.expectedOptions ?? {},
    args.inputs,
    args.enabledKeys,
  );

  const g = only(
    await tx`SELECT trip_number, trip_history FROM garments WHERE id = ${garmentId}`,
    "submitQcReal",
  );
  const trip: number = g.trip_number ?? 1;
  type TripHist = NonNullable<GarmentRow["trip_history"]>;
  const history: TripHist = (g.trip_history as TripHist | null) ?? [];
  let entry = history.find((h) => h.trip === trip);
  if (!entry) {
    entry = { trip, qc_attempts: [] };
    history.push(entry);
  }
  entry.qc_attempts = entry.qc_attempts ?? [];

  const orderedStages =
    evalResult.result === "fail"
      ? orderQcReturnStages(args.returnStagesOnFail ?? ["sewing"], PROD_STAGES)
      : null;
  const { piece_stage, qc_rework_stages } = resolveQcOutcome(
    evalResult,
    orderedStages,
  );

  const failedKeys = [
    ...evalResult.failed_measurements,
    ...evalResult.failed_options,
    ...evalResult.failed_quality,
  ];

  entry.qc_attempts.push({
    result: evalResult.result,
    trip,
    attempt_number: computeQcAttemptNumber(
      entry as unknown as Parameters<typeof computeQcAttemptNumber>[0],
      trip,
    ),
    return_stages: orderedStages,
    failed_measurements: evalResult.failed_measurements,
    failed_options: evalResult.failed_options,
    failed_quality: evalResult.failed_quality,
  });

  if (evalResult.result === "pass") {
    await tx`
      UPDATE garments
         SET piece_stage = ${piece_stage}, completion_time = NOW(),
             start_time = NULL, qc_rework_stages = NULL,
             trip_history = ${tx.json(history)}::jsonb
       WHERE id = ${garmentId}
    `;
  } else {
    await tx`
      UPDATE garments
         SET piece_stage = ${piece_stage}, start_time = NULL,
             qc_rework_stages = ${tx.array(qc_rework_stages!)},
             trip_history = ${tx.json(history)}::jsonb
       WHERE id = ${garmentId}
    `;
  }
  return { result: evalResult.result, failedKeys };
}

/**
 * dispatch_garments_to_shop RPC (triggers.sql:1450) — REAL deployed code.
 * apps/workshop dispatchGarments calls the same function (atomic move +
 * dispatch_log append; the app's best-effort log try/catch was removed).
 */
export async function workshopDispatch(tx: Tx, ids: string[]) {
  await tx`SELECT dispatch_garments_to_shop(${tx.array(ids)}::uuid[])`;
}

/** receiving-brova-final.tsx:53 — brova → awaiting_trial, final → ready_for_pickup. */
export async function shopReceive(tx: Tx, ids: string[]) {
  await tx`
    UPDATE garments
       SET location = 'shop',
           piece_stage = CASE WHEN garment_type = 'brova'
                              THEN 'awaiting_trial'::piece_stage
                              ELSE 'ready_for_pickup'::piece_stage END
     WHERE id = ANY(${tx.array(ids)}::uuid[])
  `;
}

// ─── Feedback (brova + final) ───────────────────────────────────────────────

/**
 * Brova trial verdict. Uses the real evaluateBrovaFeedback (src/utils.ts:329)
 * to compute newStage/acceptance/feedback, then applies the same updateGarment
 * payload the feedback page issues (feedback.$orderId.tsx:1705).
 */
export async function brovaFeedback(
  tx: Tx,
  orderId: number,
  garmentId: string,
  feedback: BrovaFeedback,
) {
  const brovas = (await tx`
    SELECT id, piece_stage, acceptance_status, feedback_status
    FROM garments WHERE order_id = ${orderId} AND garment_type = 'brova'
  `) as unknown as {
    id: string;
    piece_stage: string;
    acceptance_status: boolean | null;
    feedback_status: string | null;
  }[];

  const result = evaluateBrovaFeedback(feedback, brovas as any, garmentId);

  await tx`
    UPDATE garments
       SET piece_stage = ${result.newStage},
           acceptance_status = ${result.acceptanceStatus},
           feedback_status = ${result.feedbackStatus}
     WHERE id = ${garmentId}
  `;
  return result;
}

/**
 * release_finals RPC (triggers.sql:1429) — REAL deployed code. The app's
 * releaseFinals(ids) calls the same function; here we resolve the order's
 * finals and pass their ids (the RPC filters waiting_for_acceptance, so
 * non-parked finals are left untouched — same net effect as the old mirror's
 * order_id + waiting_for_acceptance filter).
 */
export async function releaseFinals(tx: Tx, orderId: number) {
  const finals = (await tx`
    SELECT id FROM garments
    WHERE order_id = ${orderId} AND garment_type = 'final'
  `) as unknown as { id: string }[];
  const ids = finals.map((f) => f.id);
  if (ids.length === 0) return;
  await tx`SELECT release_finals(${tx.array(ids)}::uuid[])`;
}

/**
 * Apply a buildFinalGarmentPayload result exactly as the feedback page's
 * updateGarment(id, payload) does — only the keys present in the payload are
 * written (reject branches omit fulfillment_type, leaving it untouched).
 */
async function applyFinalFeedback(
  tx: Tx,
  garmentId: string,
  payload: ReturnType<typeof buildFinalGarmentPayload>,
) {
  const cols = Object.keys(payload) as (keyof typeof payload)[];
  await tx`UPDATE garments SET ${tx(payload, cols)} WHERE id = ${garmentId}`;
}

/**
 * Final accepted — uses the REAL decision fn
 * (apps/pos-interface/src/lib/feedback-payload.ts:16 buildFinalGarmentPayload),
 * the same one the POS feedback page calls. Not a mirror.
 */
export async function finalCollect(
  tx: Tx,
  garmentId: string,
  opts: { homeDelivery?: boolean } = {},
) {
  await applyFinalFeedback(
    tx,
    garmentId,
    buildFinalGarmentPayload({
      feedbackAction: "accepted",
      isAlterationGarment: false,
      isHomeDelivery: !!opts.homeDelivery,
    }),
  );
}

/**
 * Final/alteration rejection — REAL decision fn
 * (apps/pos-interface/src/lib/feedback-payload.ts:16 buildFinalGarmentPayload):
 * needs_redo on non-alteration → discarded; needs_repair, or needs_redo on an
 * alteration garment → brova_trialed (customer property never discarded).
 */
export async function finalReject(
  tx: Tx,
  garmentId: string,
  action: "needs_repair" | "needs_redo",
  opts: { isAlterationOrder?: boolean } = {},
) {
  await applyFinalFeedback(
    tx,
    garmentId,
    buildFinalGarmentPayload({
      feedbackAction: action,
      isAlterationGarment: !!opts.isAlterationOrder,
      isHomeDelivery: false,
    }),
  );
}

/**
 * dispatchGarmentToWorkshop (apps/pos-interface/src/api/garments.ts:69) —
 * send a garment back: trip+1, reset to waiting_cut / transit_to_workshop.
 */
export async function sendBackToWorkshop(tx: Tx, garmentId: string) {
  await tx`
    UPDATE garments
       SET location = 'transit_to_workshop', piece_stage = 'waiting_cut',
           in_production = false, trip_number = COALESCE(trip_number, 0) + 1,
           production_plan = NULL, completion_time = NULL, start_time = NULL
     WHERE id = ${garmentId}
  `;
}

/**
 * create_replacement_garment RPC — REAL deployed code (SPEC.md §2.5). The SHOP
 * creates the redo replacement at the brova trial: clones the original's specs
 * server-side, starts fresh at trip 0 / waiting_cut / SHOP (so it lands in the
 * shop dispatch queue), links replaced_by_garment_id (double-replacement guard),
 * auto-consumes fresh fabric for the replacement cut, and records the scrapped
 * ORIGINAL fabric as a net-zero material-waste annotation. The replacement WAITS
 * IN DISPATCH (redo_parked_reason) when its IN material is short (waiting_material)
 * or it's customer-brought OUT cloth (customer_decision). The replacement's fabric
 * source defaults to the original's, overridable via fabricSource/fabricId. The
 * shop redo no longer captures root_cause (left null unless explicitly passed).
 *
 * Returns the full RPC result jsonb so callers can read parked/parked_reason.
 */
export async function createReplacementResult(
  tx: Tx,
  originalGarmentId: string,
  opts: {
    rootCause?: string | null;
    userId?: string;
    idempotencyKey?: string;
    fabricSource?: "IN" | "OUT" | null;
    fabricId?: number | null;
  } = {},
): Promise<{ id: string; garment_id: string; parked: boolean; parked_reason: string | null; fabric_source: string }> {
  const res = only(
    await tx`
      SELECT create_replacement_garment(
        ${originalGarmentId}::uuid,
        ${opts.rootCause ?? null}::root_cause,
        ${opts.userId ?? null}::uuid,
        ${opts.idempotencyKey ?? randomUUID()}::uuid,
        ${opts.fabricSource ?? null}::text,
        ${opts.fabricId ?? null}::int
      ) AS r
    `,
    "create_replacement_garment",
  );
  return res.r as { id: string; garment_id: string; parked: boolean; parked_reason: string | null; fabric_source: string };
}

/** Convenience wrapper returning just the new replacement id (back-compat). */
export async function createReplacement(
  tx: Tx,
  originalGarmentId: string,
  opts: {
    rootCause?: string | null;
    userId?: string;
    idempotencyKey?: string;
    fabricSource?: "IN" | "OUT" | null;
    fabricId?: number | null;
  } = {},
): Promise<string> {
  return (await createReplacementResult(tx, originalGarmentId, opts)).id;
}

/**
 * resume_parked_redo RPC (SPEC.md §2.5/§6) — the SHOP un-parks a replacement
 * waiting in the dispatch queue once the customer brought their cloth or our stock
 * was restocked. For company (IN) fabric this is where the deferred real -L
 * consumption finally lands; no second scrap annotation is written (eager at
 * creation). The replacement stays at the shop (trip 0, in_production false) and
 * becomes dispatchable (redo_parked_reason cleared).
 */
export async function resumeParkedRedo(
  tx: Tx,
  garmentId: string,
  opts: { userId?: string; idempotencyKey?: string } = {},
): Promise<{ resumed: boolean; consumed: number; already_active?: boolean }> {
  const res = only(
    await tx`
      SELECT resume_parked_redo(
        ${garmentId}::uuid,
        ${opts.userId ?? null}::uuid,
        ${opts.idempotencyKey ?? randomUUID()}::uuid
      ) AS r
    `,
    "resume_parked_redo",
  );
  return res.r as { resumed: boolean; consumed: number; already_active?: boolean };
}

/**
 * redo_promote_final_to_brova RPC (SPEC.md §2.5 outcome 3) — redo with NO
 * replacement: discard the brova and (optionally) promote one parked final to be
 * the new trial brova. finalId null → discard-only. Writes no money (cashier
 * refund is separate). root_cause is not captured at the shop redo (left null).
 */
export async function promoteFinalToBrova(
  tx: Tx,
  brovaId: string,
  finalId: string | null,
  opts: { rootCause?: string | null; userId?: string; idempotencyKey?: string } = {},
): Promise<{ brova_id: string; promoted_final_id: string | null; promoted_garment_id: string | null }> {
  const res = only(
    await tx`
      SELECT redo_promote_final_to_brova(
        ${brovaId}::uuid,
        ${finalId ?? null}::uuid,
        ${opts.rootCause ?? null}::root_cause,
        ${opts.userId ?? null}::uuid,
        ${opts.idempotencyKey ?? randomUUID()}::uuid
      ) AS r
    `,
    "redo_promote_final_to_brova",
  );
  return res.r as { brova_id: string; promoted_final_id: string | null; promoted_garment_id: string | null };
}

/**
 * Full-order cancel (apps/pos-interface/src/components/forms/
 * customer-demographics/pending-orders-dialog.tsx:200).
 * Real app calls updateOrder({ checkout_status: 'cancelled' }, orderId)
 * which issues: UPDATE orders SET checkout_status='cancelled' WHERE id=$id.
 * Garments are NOT auto-discarded (documented: in-progress workshop work may
 * continue / orphan).
 */
export async function cancelOrder(tx: Tx, orderId: number) {
  await tx`UPDATE orders SET checkout_status = 'cancelled' WHERE id = ${orderId}`;
}

/** create_complete_sales_order RPC (triggers.sql:453). */
export async function createSalesOrder(
  tx: Tx,
  items: { id: number; quantity: number; unitPrice: number }[],
  opts: { paid?: number; idempotencyKey?: string } = {},
) {
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  await actAs(tx, CASHIER.id);
  const res = only(
    await tx`
    SELECT create_complete_sales_order(
      ${CUSTOMER_ID},
      ${tx.json({
        paymentType: "cash",
        paid: opts.paid ?? total,
        orderTaker: CASHIER.id,
        discountType: "flat",
        discountValue: 0,
        discountPercentage: 0,
        referralCode: null,
        total,
        orderTotal: total,
        shelfCharge: total,
        deliveryCharge: 0,
        brand: BRAND,
      })}::jsonb,
      ${tx.json(items)}::jsonb,
      ${opts.idempotencyKey ?? randomUUID()}::uuid
    ) AS r
  `,
    "create_complete_sales_order",
  );
  return res.r;
}

// ─── Partial production + EOD / register (foundation for new test files) ─────

/**
 * Run the production chain only up to (and including) `stop`. Lets a test park
 * a garment mid-production (e.g. 'sewing') — needed for refund-while-in-
 * production and soaking scenarios. Same UPDATE shape as runProduction.
 */
export async function runProductionTo(
  tx: Tx,
  ids: string[],
  stop: ProdStage,
) {
  const stopIdx = PROD_STAGES.indexOf(stop);
  if (stopIdx < 0) throw new Error(`runProductionTo: bad stop stage ${stop}`);
  await tx`
    UPDATE garments
       SET piece_stage = 'cutting', in_production = true, qc_rework_stages = NULL
     WHERE id = ANY(${tx.array(ids)}::uuid[]) AND piece_stage = 'waiting_cut'
  `;
  for (let i = 1; i <= stopIdx; i++) {
    const next = PROD_STAGES[i]!;
    const prev = PROD_STAGES[i - 1]!;
    await tx`
      UPDATE garments
         SET piece_stage = ${next}, completion_time = NOW(), start_time = NULL
       WHERE id = ANY(${tx.array(ids)}::uuid[]) AND piece_stage = ${prev}
    `;
  }
}

/** open_register RPC (triggers.sql:3492). */
export async function openRegister(
  tx: Tx,
  openingFloat: number,
  opts: { date?: string } = {},
) {
  await actAs(tx, CASHIER.id);
  const res = only(
    await tx`
      SELECT open_register(
        ${BRAND}, ${opts.date ?? null}::date, ${CASHIER.id}::uuid, ${openingFloat}
      ) AS r
    `,
    "open_register",
  );
  return res.r;
}

/** close_register RPC (triggers.sql:3538). idempotencyKey defaults fresh. */
export async function closeRegister(
  tx: Tx,
  sessionId: number,
  countedCash: number,
  opts: { notes?: string; idempotencyKey?: string } = {},
) {
  await actAs(tx, CASHIER.id);
  const res = only(
    await tx`
      SELECT close_register(
        ${sessionId}, ${CASHIER.id}::uuid, ${countedCash},
        ${opts.notes ?? null}, 180,
        ${opts.idempotencyKey ?? randomUUID()}::uuid
      ) AS r
    `,
    "close_register",
  );
  return res.r;
}

/** reopen_register RPC (triggers.sql:3736). */
export async function reopenRegister(tx: Tx, sessionId: number) {
  // Spec: reopen requires manager approval (CLAUDE.md §EOD / register close).
  await actAs(tx, MANAGER.id);
  const res = only(
    await tx`SELECT reopen_register(${sessionId}, ${MANAGER.id}::uuid) AS r`,
    "reopen_register",
  );
  return res.r;
}

/** get_register_session RPC (triggers.sql:3402) — current session for BRAND. */
export async function getRegisterSession(tx: Tx, opts: { date?: string } = {}) {
  const res = only(
    await tx`SELECT get_register_session(${BRAND}, ${opts.date ?? null}::date) AS r`,
    "get_register_session",
  );
  return res.r as Record<string, unknown> | null;
}

// ─── Stock purchases (non-customer expense payables) ─────────────────────────

/** restock_item RPC. Shop fabric/shelf restock requires a unit cost and mints
 *  an unpaid stock_purchases payable + maintains WAC. Returns the RPC result. */
export async function restock(
  tx: Tx,
  args: {
    itemType?: "fabric" | "shelf" | "accessory";
    itemId?: number;
    location?: "shop" | "workshop";
    qty: number;
    unitCost?: number | null;
    supplierId?: number | null;
    notes?: string | null;
    idempotencyKey?: string;
  },
) {
  await actAs(tx, MANAGER.id);
  const res = only(
    await tx`
      SELECT restock_item(
        ${args.itemType ?? "fabric"}::stock_item_type,
        ${args.itemId ?? FABRIC_A_ID},
        ${args.location ?? "shop"}::stock_location,
        ${args.qty},
        ${args.supplierId ?? null}::int,
        ${args.unitCost ?? null}::numeric,
        ${args.notes ?? null}::text,
        NULL,
        ${MANAGER.id}::uuid,
        ${args.idempotencyKey ?? randomUUID()}::uuid
      ) AS r
    `,
    "restock_item",
  );
  return res.r as {
    success: boolean;
    new_stock: number;
    avg_cost: number | null;
    purchase_id: number | null;
    total_cost: number | null;
  };
}

/** pay_stock_purchase RPC. Cash settlements post a drawer cash_out (need an open
 *  session); non-cash leave the drawer untouched. */
export async function payStockPurchase(
  tx: Tx,
  purchaseId: number,
  amount: number,
  opts: {
    paymentType?: "cash" | "knet" | "link_payment" | "bank_transfer" | "others";
    sessionId?: number | null;
    refNo?: string | null;
    note?: string | null;
    idempotencyKey?: string;
  } = {},
) {
  await actAs(tx, CASHIER.id);
  const res = only(
    await tx`
      SELECT pay_stock_purchase(
        ${purchaseId},
        ${amount},
        ${opts.paymentType ?? "cash"},
        ${opts.sessionId ?? null}::int,
        ${opts.refNo ?? null}::text,
        ${opts.note ?? null}::text,
        ${CASHIER.id}::uuid,
        ${opts.idempotencyKey ?? randomUUID()}::uuid
      ) AS r
    `,
    "pay_stock_purchase",
  );
  return res.r as {
    purchase_id: number;
    amount_paid: number;
    total_cost: number;
    status: string;
    cash_movement_id: number | null;
  };
}

/** add_cash_movement RPC — a manual drawer cash_in/out (drop/deposit/petty-cash/tip-out). */
export async function addCashMovement(
  tx: Tx,
  sessionId: number,
  type: "cash_in" | "cash_out",
  amount: number,
  opts: {
    reasonCategory?:
      | "drop" | "pickup" | "petty_cash" | "bank_deposit" | "change_refill" | "tip_out" | "other";
    reason?: string;
    idempotencyKey?: string;
  } = {},
) {
  await actAs(tx, CASHIER.id);
  const res = only(
    await tx`
      SELECT add_cash_movement(
        ${sessionId},
        ${type},
        ${amount},
        ${opts.reason ?? "test movement"},
        ${CASHIER.id}::uuid,
        180,
        ${opts.reasonCategory ?? "other"},
        ${opts.idempotencyKey ?? randomUUID()}::uuid
      ) AS r
    `,
    "add_cash_movement",
  );
  return res.r as { id: number };
}

/** get_stock_purchases RPC — the cashier queue ('open') / history listing. */
export async function getStockPurchases(
  tx: Tx,
  opts: { filter?: "open" | "paid" | "all"; limit?: number } = {},
) {
  await actAs(tx, CASHIER.id);
  const res = only(
    await tx`
      SELECT get_stock_purchases(${BRAND}, ${opts.filter ?? "open"}, ${opts.limit ?? 200}) AS r
    `,
    "get_stock_purchases",
  );
  return res.r as Array<Record<string, unknown>>;
}

/** Read an item's stored weighted-average cost (avg_cost). */
export async function getItemAvgCost(
  tx: Tx,
  itemType: "fabric" | "shelf",
  itemId: number,
): Promise<number | null> {
  const table = itemType === "fabric" ? "fabrics" : "shelf";
  const row = only(
    await tx`SELECT avg_cost FROM ${tx(table)} WHERE id = ${itemId}`,
    `${table} ${itemId} avg_cost`,
  ) as unknown as { avg_cost: string | number | null };
  return row.avg_cost == null ? null : Number(row.avg_cost);
}

export { SHELF_A_ID };

/** get_eod_report RPC (triggers.sql:3183). */
export async function getEodReport(
  tx: Tx,
  opts: { from?: string; to?: string } = {},
) {
  const res = only(
    await tx`
      SELECT get_eod_report(
        ${BRAND},
        ${opts.from ?? null}::date,
        ${opts.to ?? null}::date,
        180
      ) AS r
    `,
    "get_eod_report",
  );
  return res.r as Record<string, unknown>;
}
