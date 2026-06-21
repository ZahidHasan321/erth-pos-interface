import { test, expect, type Page } from "@playwright/test";
import { loginShop, loginWorkshop } from "../fixtures/login";
import { POS_BASE_URL, WORKSHOP_BASE_URL, USERS } from "../config";
import { getDb, closeDb } from "../helpers/db";
import { seedConfirmedWorkOrderWithFinal, type SeededOrder } from "../helpers/seed-order";
import { assertNoLeak, assertGarmentAt } from "../helpers/no-leak";
import { advanceProductionToQc, passQc } from "../helpers/production";

/**
 * Phase 2b — the FIRST full lifecycle test of the cross-app e2e suite.
 *
 * A WORK order with ONE final garment is taken all the way around the initial
 * production round-trip — confirm → cashier-process → dispatch → workshop receive
 * → park → schedule → produce → QC → dispatch back → shop receive → collect — and
 * after EVERY step we assert the no-leak invariant (CLAUDE.md §2: no garment ever
 * hides). The assertion reads the COMMITTED DB the UI just mutated, maps the
 * garment to the @repo/database surface oracle, and proves isGarmentLeaked=false,
 * plus the garment's DB location/stage/trip matches the step's expectation.
 *
 * HYBRID approach (see each helper's header for WHY):
 *   SEEDED  — order CREATION (RPC; the new-work-order form is too brittle), and the
 *             INTERNAL production chain cutting→QC-pass (the terminal flow + the
 *             full QC measurement/option/quality form are too brittle for pass 1).
 *   UI      — every lifecycle TRANSITION the no-leak invariant actually exercises:
 *             cashier-process, shop dispatch, workshop receive, parking→scheduler
 *             (incl. the ProductionPlanDialog), workshop dispatch, shop receive,
 *             cashier handover/collect.
 *
 * The seeded steps are marked `// SEEDED (TODO: drive via UI)` and STILL have the
 * no-leak assertion run around them.
 *
 * Single browser context, re-login per actor (POS :5173 and workshop :5174 are
 * separate origins, so their sessions don't clash).
 */

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await closeDb();
});

// ── small UI utilities ───────────────────────────────────────────────────────

/** Wait until a DB predicate holds (the UI mutation has landed), or fail. */
async function waitForDb(
  poll: () => Promise<boolean>,
  label: string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await poll()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitForDb timed out: ${label}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function garmentStage(garmentUuid: string): Promise<{ location: string; piece_stage: string; trip_number: number; in_production: boolean }> {
  const sql = getDb();
  const [g] = await sql<{ location: string; piece_stage: string; trip_number: number; in_production: boolean }[]>`
    SELECT location, piece_stage, trip_number, in_production FROM garments WHERE id = ${garmentUuid}
  `;
  if (!g) throw new Error(`garmentStage: garment ${garmentUuid} not found`);
  return g;
}

/**
 * Clear the Supabase GoTrue session for an origin so the next login starts cold.
 * We SWITCH actors mid-test (cashier → order-taker → cashier on POS); without
 * clearing, the still-authenticated session makes /login redirect to /home (the
 * brand picker) and the login form never renders. Done by wiping the origin's
 * localStorage/sessionStorage where the supabase-js client persists its token.
 */
async function clearSession(page: Page, baseUrl: string): Promise<void> {
  // Cookies first (cheap, never loads a page). Then wipe the origin's storage,
  // where supabase-js persists the GoTrue token. `goto` can occasionally crash
  // the renderer after a long-running session (Chromium OOM), so retry on crash.
  await page.context().clearCookies();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1500)); // let the renderer recover
    }
  }
  await page.evaluate(() => {
    try { window.localStorage.clear(); } catch { /* origin not accessible yet */ }
    try { window.sessionStorage.clear(); } catch { /* */ }
  });
}

/** Log in to the shop app as a specific actor from a clean session. */
async function freshLoginShop(
  page: Page,
  user: { username: string },
  expectedSuffix: string,
): Promise<void> {
  await clearSession(page, POS_BASE_URL);
  await loginShop(page, user, expectedSuffix);
}

/** Log in to the workshop app as a specific actor from a clean session. */
async function freshLoginWorkshop(
  page: Page,
  user: { username: string },
  expectedSuffix: string,
): Promise<void> {
  await clearSession(page, WORKSHOP_BASE_URL);
  await loginWorkshop(page, user, expectedSuffix);
}

test("initial production round-trip of a one-final WORK order: no garment ever hides", async ({ page }) => {
  test.setTimeout(240_000);

  // ── STEP 0 — SEED the confirmed, unpaid order (RPC; form too brittle) ──
  const order: SeededOrder = await seedConfirmedWorkOrderWithFinal();

  // Confirmed / unpaid / pending-cashier invariants, straight from the DB.
  {
    const sql = getDb();
    const [o] = await sql<{ checkout_status: string; paid: string; order_type: string }[]>`
      SELECT checkout_status, paid::text, order_type FROM orders WHERE id = ${order.orderId}
    `;
    const [w] = await sql<{ cashier_processed_at: string | null; invoice_number: number }[]>`
      SELECT cashier_processed_at, invoice_number FROM work_orders WHERE order_id = ${order.orderId}
    `;
    expect(o?.checkout_status, "seed: order confirmed").toBe("confirmed");
    expect(Number(o?.paid), "seed: order unpaid").toBe(0);
    expect(o?.order_type).toBe("WORK");
    expect(w?.cashier_processed_at, "seed: cashier gate not yet cleared").toBeNull();
  }
  // At the shop, waiting_cut, trip 0 — out of the workshop universe, so trivially
  // not leaked, but we assert position + no-leak to anchor the start.
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "0. seeded order",
    location: "shop",
    piece_stage: "waiting_cut",
    trip_number: 0,
  });

  // ── STEP 1 — UI: cashier clears the §3 processing gate (confirm w/o payment) ──
  await freshLoginShop(page, USERS.cashier, "/cashier");
  await page.goto(`${POS_BASE_URL}/cashier`); // Pending queue (standalone cashier shell)

  // Find the order's pending row (shows "#<invoice>" + "Test Customer") and select it.
  const pendingRow = page
    .locator("div", { hasText: `#${order.invoiceNumber}` })
    .filter({ hasText: "Test Customer" })
    .last();
  await expect(pendingRow, "cashier: pending row visible").toBeVisible({ timeout: 20_000 });
  await pendingRow.click();

  await page.getByRole("button", { name: /Confirm without payment/i }).click();
  // Confirmation dialog → primary action labelled "Confirm orders".
  await page.getByRole("button", { name: /^Confirm orders$/i }).click();

  await waitForDb(async () => {
    const sql = getDb();
    const [w] = await sql<{ cashier_processed_at: string | null }[]>`
      SELECT cashier_processed_at FROM work_orders WHERE order_id = ${order.orderId}
    `;
    return w?.cashier_processed_at != null;
  }, "cashier_processed_at set");

  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "1. cashier processed (gate cleared)",
    location: "shop",
    piece_stage: "waiting_cut",
    trip_number: 0,
  });

  // ── STEP 2 — UI: order-taker dispatches the order to the workshop ──
  await freshLoginShop(page, USERS.orderTaker, "/erth");
  await page.goto(`${POS_BASE_URL}/erth/orders/order-management/dispatch`); // "New orders" tab

  const dispatchCard = page
    .locator("div.rounded-lg", { hasText: `INV ${order.invoiceNumber}` })
    .filter({ hasText: "Test Customer" })
    .first();
  await expect(dispatchCard, "dispatch: order card visible").toBeVisible({ timeout: 20_000 });
  await dispatchCard.getByRole("button", { name: /^Dispatch/i }).click();

  await waitForDb(async () => (await garmentStage(order.garmentUuid)).location === "transit_to_workshop", "dispatched to workshop");

  // Now in the workshop universe → must render in receiving.
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "2. dispatched (transit_to_workshop)",
    location: "transit_to_workshop",
    piece_stage: "waiting_cut",
    trip_number: 1,
    surfaces: ["receiving"],
  });

  // ── STEP 3 — UI: workshop receives the final ──
  await freshLoginWorkshop(page, USERS.workshopAdmin, "/receiving");
  await page.goto(`${WORKSHOP_BASE_URL}/receiving`);

  // The final lands in the "Finals" receiving section; its row has a "Receive" button.
  const wsReceiveRow = page.locator("tr", { hasText: `#${order.orderId}` }).first();
  await expect(wsReceiveRow, "ws receive: row visible").toBeVisible({ timeout: 20_000 });
  await wsReceiveRow.getByRole("button", { name: /^Receive$/i }).click();

  await waitForDb(async () => (await garmentStage(order.garmentUuid)).location === "workshop", "received at workshop");

  // At workshop, not in production, waiting_cut → parking ("Finals", no brova).
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "3. workshop received (parking)",
    location: "workshop",
    piece_stage: "waiting_cut",
    trip_number: 1,
    surfaces: ["parking"],
  });

  // ── STEP 4 — UI: parking → scheduler ──
  await page.goto(`${WORKSHOP_BASE_URL}/parking`);
  const parkRow = page.locator("tr", { hasText: `#${order.orderId}` }).first();
  await expect(parkRow, "parking: row visible").toBeVisible({ timeout: 20_000 });
  await parkRow.getByRole("button", { name: /^Schedule$/i }).click();

  await waitForDb(async () => (await garmentStage(order.garmentUuid)).in_production === true, "sent to scheduler (in_production)");

  // in_production + waiting_cut + no plan → scheduler surface.
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "4. sent to scheduler",
    location: "workshop",
    piece_stage: "waiting_cut",
    trip_number: 1,
    surfaces: ["scheduler"],
  });

  // ── STEP 5 — UI: scheduler builds the production plan (ProductionPlanDialog) ──
  await scheduleViaUi(page, order);

  await waitForDb(async () => (await garmentStage(order.garmentUuid)).piece_stage === "cutting", "scheduled into cutting");

  // Scheduled → piece_stage cutting, plan set → cutting terminal.
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "5. scheduled (cutting terminal)",
    location: "workshop",
    piece_stage: "cutting",
    trip_number: 1,
    surfaces: ["terminal:cutting"],
  });

  // ── STEP 6 — SEEDED (TODO: drive via UI): production chain cutting → quality_check ──
  // The per-stage terminal flow + full QC form are too brittle for pass 1; advance
  // the internal chain via the shared driver, still asserting no-leak around it.
  await advanceProductionToQc(order.garmentUuid);
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "6. in production (quality_check terminal)",
    location: "workshop",
    piece_stage: "quality_check",
    trip_number: 1,
    surfaces: ["terminal:quality_check"],
  });

  // ── STEP 7 — SEEDED (TODO: drive via UI): QC pass → ready_for_dispatch ──
  await passQc(order.garmentUuid);
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "7. QC passed (dispatch ready)",
    location: "workshop",
    piece_stage: "ready_for_dispatch",
    trip_number: 1,
    surfaces: ["dispatch"],
  });

  // ── STEP 8 — UI: workshop dispatches the garment back to the shop ──
  await page.goto(`${WORKSHOP_BASE_URL}/dispatch`); // Ready tab (default)
  const readyCard = page
    .locator("div.rounded-md", { hasText: `Order ${order.orderId}` })
    .first();
  await expect(readyCard, "ws dispatch: ready card visible").toBeVisible({ timeout: 20_000 });
  await readyCard.getByRole("button", { name: /^Dispatch/i }).click();

  await waitForDb(async () => (await garmentStage(order.garmentUuid)).location === "transit_to_shop", "dispatched back to shop");

  // transit_to_shop → dispatch In-transit tab.
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "8. dispatched back (transit_to_shop)",
    location: "transit_to_shop",
    piece_stage: "ready_for_dispatch",
    trip_number: 1,
    surfaces: ["dispatch"],
  });

  // ── STEP 9 — UI: shop receives the final at the showroom ──
  await freshLoginShop(page, USERS.orderTaker, "/erth");
  await page.goto(`${POS_BASE_URL}/erth/orders/order-management/receiving-brova-final`);

  const shopRecvCard = page
    .locator("div.rounded-lg", { hasText: `INV ${order.invoiceNumber}` })
    .filter({ hasText: "Test Customer" })
    .first();
  await expect(shopRecvCard, "shop receive: card visible").toBeVisible({ timeout: 20_000 });
  await shopRecvCard.getByRole("button", { name: /^Receive/i }).click();

  await waitForDb(async () => {
    const g = await garmentStage(order.garmentUuid);
    return g.location === "shop" && g.piece_stage === "ready_for_pickup";
  }, "received at shop (ready_for_pickup)");

  // Back at the shop, ready_for_pickup — out of the workshop universe (not leaked).
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "9. shop received (ready_for_pickup)",
    location: "shop",
    piece_stage: "ready_for_pickup",
    trip_number: 1,
    surfaces: [],
  });

  // ── STEP 10 — UI: cashier hands over / collects the final → completed ──
  await freshLoginShop(page, USERS.cashier, "/cashier");
  // The order-detail (handover) surface is ungated on the register, reached directly.
  await page.goto(`${POS_BASE_URL}/cashier/${order.orderId}`);

  // Switch to the Handover pill (order is unpaid → defaults to Payment mode).
  await page.getByRole("button", { name: /^Handover$/i }).click();

  // Select the garment, then submit the collection.
  await page.getByRole("checkbox", { name: "Select garment" }).first().check();
  await page.getByRole("button", { name: /Collect \d+ garment/i }).click();

  await waitForDb(async () => (await garmentStage(order.garmentUuid)).piece_stage === "completed", "collected (completed)");

  // Completed = terminal state — not leaked.
  await assertGarmentAt(order.orderId, order.garmentUuid, {
    label: "10. collected (completed)",
    location: "shop",
    piece_stage: "completed",
    trip_number: 1,
    surfaces: [],
  });
});

/**
 * Drive the scheduler's ProductionPlanDialog: select the final in the "Finals"
 * section, open the dialog ("Create plan"), assign a worker for every stage
 * (a UNIT chip for sewing), and submit ("Schedule"). The seeded resources back
 * every chip (see scripts/seed-users.ts seedResources).
 */
async function scheduleViaUi(page: Page, order: SeededOrder): Promise<void> {
  await page.goto(`${WORKSHOP_BASE_URL}/scheduler`);

  // The final renders in the "Finals" section (no brova in the order). Select its
  // row (shows "#<orderId>").
  const schedRow = page.locator("tr", { hasText: `#${order.orderId}` }).first();
  await expect(schedRow, "scheduler: row visible").toBeVisible({ timeout: 20_000 });
  await schedRow.locator('button[role="checkbox"]').first().check();

  // Open the plan dialog.
  await page.getByRole("button", { name: /^Create plan/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog, "scheduler: plan dialog open").toBeVisible({ timeout: 10_000 });

  // Assign every stage by clicking its single seeded chip. Cutting / Finishing /
  // Ironing / Quality Check are worker chips; Sewing is a unit chip — all rendered
  // as AssignmentChip <button>s (aria-pressed reflects selection) inside their
  // StageRow picker. Each chip's accessible NAME includes a trailing load badge
  // ("E2E Cutter Worker 0/100"), so we substring-match on the worker/unit name.
  // A single-unit sewing stage is auto-selected on open, so we click a chip only
  // when it isn't already pressed (clicking a selected chip would DESELECT it).
  const { WORKERS } = await import("../config");
  const chipNames = [
    WORKERS.cutting, // "E2E Cutter Worker"
    WORKERS.sewing, // "Unit A" — sewing is assigned by UNIT, not a person
    WORKERS.finishing,
    WORKERS.ironing,
    WORKERS.quality_check,
  ];

  for (const name of chipNames) {
    const chip = dialog.getByRole("button", { name, exact: false }).first();
    await expect(chip, `plan dialog: chip "${name}" visible`).toBeVisible({ timeout: 10_000 });
    if ((await chip.getAttribute("aria-pressed")) !== "true") {
      await chip.click();
    }
  }

  // All five stages assigned (5/5) → Schedule enabled. Submit the plan.
  const scheduleBtn = dialog.getByRole("button", { name: /^Schedule$/i });
  await expect(scheduleBtn, "scheduler: Schedule enabled").toBeEnabled({ timeout: 10_000 });
  await scheduleBtn.click();
  await expect(dialog, "scheduler: plan dialog closed").toBeHidden({ timeout: 10_000 });
}
