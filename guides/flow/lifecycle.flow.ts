/**
 * THE FLOW — one WORK order, front to back, in the order the work happens.
 *
 *   take the order -> cashier processes it -> dispatch to workshop -> workshop
 *   receives -> schedule and produce -> QC -> dispatch back -> shop receives ->
 *   handover
 *
 * This walks the SAME journey as e2e/tests/lifecycle-initial.spec.ts and reuses its
 * selectors on purpose. The lifecycle suite proves the journey is correct; this file
 * documents it. When the UI moves, both break in the same run, so the guide cannot
 * quietly go stale — which is the failure mode of every screenshot manual ever
 * written by hand.
 *
 * Every capture is annotated with numbered callouts only. The words that explain
 * them live in ../locales/{en,hi}.json.
 */
import { test } from "@playwright/test";
import { loginShop, loginWorkshop } from "../../e2e/fixtures/login";
import { POS_BASE_URL, WORKSHOP_BASE_URL, USERS, WORKERS } from "../../e2e/config";
import { getDb, closeDb } from "../../e2e/helpers/db";
import {
  ensureGuideCustomer,
  freshGuideOrder,
  GUIDE_CUSTOMER,
  type GuideOrder,
} from "../lib/seed";
import { advanceProductionToQc, passQc } from "../../e2e/helpers/production";
import { chapter } from "../lib/shot";
import { clearSession, waitForDb, garmentStage } from "../lib/session";

test.describe.configure({ mode: "serial" });
test.afterAll(async () => closeDb());

test("the flow: a work order from intake to handover", async ({ page }) => {
  test.setTimeout(300_000);

  // The customer the guide follows has to exist BEFORE chapter 1, because 1b
  // collides with their mobile number on purpose to trigger the duplicate block.
  await ensureGuideCustomer();

  // ── CHAPTER 1 — take the order ───────────────────────────────────────────────
  // Driven action by action, dialogs included. Two passes, because the customer
  // step forks on the mobile number and one run cannot type both a new number and
  // an existing one into the same field:
  //   1a  a number nobody has used  -> straight through to the confirmation
  //   1b  a number already on file  -> the hard block, and both ways out of it
  {
    const ch = chapter({ id: "01-take-order", order: 1, app: "shop" });
    const NEW_CUSTOMER = { name: "Salem Al-Ajmi", phone: "99887766" };

    await clearSession(page, POS_BASE_URL);
    await loginShop(page, USERS.orderTaker, "/erth");

    // 1. the nav click that starts the whole job
    // Scope to the sidebar: the dashboard also renders a "New Work Order" quick
    // action, and an ambiguous locator would silently annotate whichever the
    // engine happened to resolve first.
    const navLink = page.locator('a[href$="/orders/new-work-order"]').first();
    await navLink.waitFor({ state: "visible", timeout: 20_000 });
    await ch.shot(page, "open-from-sidebar", [{ at: navLink }]);
    await navLink.click();

    const nameInput = page.locator('input[name="name"]');
    const phoneInput = page.locator('input[name="phone"]');
    await nameInput.waitFor({ state: "visible", timeout: 20_000 });

    // 2. name
    await ch.shot(page, "enter-name", [{ at: nameInput }]);
    await nameInput.fill(NEW_CUSTOMER.name);

    // 3. country code + mobile, marked as the two separate controls they are
    await ch.shot(page, "enter-mobile", [
      { at: page.getByRole("combobox").filter({ hasText: "+965" }).first() },
      { at: phoneInput, badge: "top-right" },
    ]);
    await phoneInput.fill(NEW_CUSTOMER.phone);
    // The duplicate check is debounced 500ms off onChange; wait it out so the
    // "clean number" shot cannot accidentally catch a half-resolved warning.
    await page.waitForTimeout(1200);

    // 4. nationality + account type, the two choices on this screen
    await ch.shot(page, "choose-account-type", [
      { at: page.getByRole("combobox").filter({ hasText: "Kuwait" }).first() },
      { at: page.getByRole("combobox", { name: /Account Type/ }), badge: "top-right" },
    ]);

    // 5. submit -> confirmation dialog. act() refuses to continue if the dialog
    // this opens is never captured.
    const confirmCustomer = page.getByRole("button", { name: /^Confirm Customer$/ });
    await ch.shot(page, "press-confirm-customer", [{ at: confirmCustomer, badge: "top-right" }]);
    await ch.act(page, confirmCustomer, "submit the customer");

    // 6. the confirmation itself
    const confirmDialog = page.getByRole("dialog").first();
    const confirmYes = confirmDialog.getByRole("button", { name: "Confirm", exact: true });
    await confirmYes.waitFor({ state: "visible", timeout: 10_000 });
    await ch.shot(page, "confirm-customer-dialog", [{ at: confirmYes, badge: "top-right" }]);

    // Back out instead of committing: this pass exists to teach the screen, and
    // creating a second order here would pollute the cashier queue that chapter 2
    // is about. The prose says what Confirm does next.
    await confirmDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await confirmDialog.waitFor({ state: "hidden", timeout: 10_000 });

    // ── 1b. the same field, a number already on file ──────────────────────────
    await phoneInput.fill("");
    await phoneInput.pressSequentially(GUIDE_CUSTOMER.phone, { delay: 40 });

    // The inline warning lands first, before the modal.
    const warning = page.getByText(/already used by Primary account/i);
    await warning.waitFor({ state: "visible", timeout: 15_000 });

    const dupDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Mobile number already in use" });
    await dupDialog.waitFor({ state: "visible", timeout: 15_000 });

    // 7. the block, and the three ways out of it
    await ch.shot(page, "duplicate-block", [
      { at: dupDialog.getByRole("button", { name: /Same customer/ }) },
      { at: dupDialog.getByRole("button", { name: /Family member/ }) },
      { at: dupDialog.getByRole("button", { name: /typo/ }) },
    ]);

    // 8. take the family-member route and capture what it asks for next
    await dupDialog.getByRole("button", { name: /Family member/ }).click();
    const relationSelect = dupDialog.getByRole("combobox");
    await relationSelect.waitFor({ state: "visible", timeout: 10_000 });
    await ch.shot(page, "link-as-family", [
      { at: relationSelect },
      {
        at: dupDialog.getByRole("button", { name: /^Link as family member$/ }),
        badge: "top-right",
      },
    ]);

    // 9. relation is required — show the list rather than describing it
    await relationSelect.click();
    const sonOption = page.getByRole("option", { name: "Son", exact: true });
    await sonOption.waitFor({ state: "visible", timeout: 10_000 });
    await ch.shot(page, "choose-relation", [{ at: sonOption }]);

    ch.close();
  }

  // Chapter 1 drove a real form; wipe anything it left so the cashier queue in
  // chapter 2 shows exactly one order.
  const order: GuideOrder = await freshGuideOrder();

  // ── CHAPTER 2 — the cashier processes it ─────────────────────────────────────
  // This is the gate. Not the payment: the MARKER. Until a cashier touches this
  // order it cannot go to the workshop, even if the customer has already paid.
  {
    const ch = chapter({ id: "02-cashier", order: 2, app: "shop" });

    await clearSession(page, POS_BASE_URL);
    // The standalone /cashier terminal was removed (SPEC §3); the cashier surface
    // now lives inside the brand shell, so the cashier lands on /erth like everyone
    // else and we navigate into the tab.
    await loginShop(page, USERS.cashier, "/erth");
    await page.goto(`${POS_BASE_URL}/erth/cashier`);

    // Match the card by its EXACT invoice text. A substring match on "#12" also
    // matches "#123", which silently annotates the wrong order.
    // `.last()` here would resolve to the innermost matching <div> — the text row —
    // and box a narrow strip instead of the card. Take the outermost card-shaped
    // ancestor instead, so the callout frames what a reader would call "the order".
    const pendingRow = page
      .locator("div.rounded-lg, div.rounded-xl, div.rounded-md")
      .filter({ has: page.getByText(`#${order.invoiceNumber}`, { exact: true }) })
      .first();
    await pendingRow.waitFor({ state: "visible", timeout: 20_000 });

    // The queue as the cashier finds it. The action bar does not exist yet: the
    // buttons only appear once something is selected, which is itself worth showing.
    await ch.shot(page, "pending-queue", [
      { at: page.getByRole("link", { name: "Cashier", exact: true }) },
      { at: pendingRow },
    ]);

    await pendingRow.click();

    const confirmWithout = page.getByRole("button", { name: /Confirm without payment/i });
    await ch.shot(page, "order-selected", [
      { at: confirmWithout, badge: "top-right" },
      { at: page.getByRole("button", { name: /Proceed to payment/i }), badge: "top-right" },
    ]);

    await confirmWithout.click();
    const confirmBtn = page.getByRole("button", { name: /^Confirm orders$/i });
    await confirmBtn.waitFor({ state: "visible", timeout: 10_000 });
    await ch.shot(page, "confirm-dialog", [{ at: confirmBtn }]);

    await confirmBtn.click();
    await waitForDb(async () => {
      const sql = getDb();
      const [w] = await sql<{ cashier_processed_at: string | null }[]>`
        SELECT cashier_processed_at FROM work_orders WHERE order_id = ${order.orderId}
      `;
      return w?.cashier_processed_at != null;
    }, "cashier_processed_at set");

    ch.close();
  }

  // ── CHAPTER 3 — dispatch to the workshop ─────────────────────────────────────
  // trip 0 -> 1. Only trip-0 garments appear here, and only once chapter 2 is done.
  {
    const ch = chapter({ id: "03-dispatch", order: 3, app: "shop" });

    await clearSession(page, POS_BASE_URL);
    await loginShop(page, USERS.orderTaker, "/erth");
    await page.goto(`${POS_BASE_URL}/erth/orders/order-management/dispatch`);

    const card = page
      .locator("div.rounded-lg", { hasText: `INV ${order.invoiceNumber}` })
      .filter({ hasText: GUIDE_CUSTOMER.name })
      .first();
    await card.waitFor({ state: "visible", timeout: 20_000 });

    const dispatchBtn = card.getByRole("button", { name: /^Dispatch/i });
    await ch.shot(page, "new-orders-tab", [
      { at: page.getByRole("link", { name: "Dispatch Orders", exact: true }) },
      { at: dispatchBtn, badge: "top-right" },
    ]);

    await dispatchBtn.click();
    await waitForDb(
      async () => (await garmentStage(order.garmentUuid)).location === "transit_to_workshop",
      "dispatched to workshop",
    );

    await page.reload();
    await ch.shot(page, "after-dispatch");
    ch.close();
  }

  // ── CHAPTER 4 — the workshop receives it ─────────────────────────────────────
  // "Receive" parks the piece. "Receive & Start" sends it straight to scheduling.
  {
    const ch = chapter({ id: "04-workshop-receive", order: 4, app: "workshop" });

    await clearSession(page, WORKSHOP_BASE_URL);
    await loginWorkshop(page, USERS.workshopAdmin, "/receiving");
    await page.goto(`${WORKSHOP_BASE_URL}/receiving`);

    const row = page.locator("tr", { hasText: `#${order.orderId}` }).first();
    await row.waitFor({ state: "visible", timeout: 20_000 });

    await ch.shot(page, "receiving-list", [
      { at: row.getByRole("button", { name: /^Receive$/i }), badge: "top-right" },
    ]);

    await row.getByRole("button", { name: /^Receive$/i }).click();
    await waitForDb(
      async () => (await garmentStage(order.garmentUuid)).location === "workshop",
      "received at workshop",
    );

    await page.goto(`${WORKSHOP_BASE_URL}/parking`);
    const parkRow = page.locator("tr", { hasText: `#${order.orderId}` }).first();
    await parkRow.waitFor({ state: "visible", timeout: 20_000 });
    await ch.shot(page, "parking", [
      { at: parkRow.getByRole("button", { name: /^Schedule$/i }), badge: "top-right" },
    ]);

    await parkRow.getByRole("button", { name: /^Schedule$/i }).click();
    await waitForDb(
      async () => (await garmentStage(order.garmentUuid)).in_production === true,
      "sent to scheduler",
    );
    ch.close();
  }

  // ── CHAPTER 5 — schedule the work ────────────────────────────────────────────
  // Every stage needs an owner before the piece can start. Sewing is assigned to a
  // UNIT, not a person; the other four are individual workers.
  {
    const ch = chapter({ id: "05-schedule", order: 5, app: "workshop" });

    await page.goto(`${WORKSHOP_BASE_URL}/scheduler`);
    const row = page.locator("tr", { hasText: `#${order.orderId}` }).first();
    await row.waitFor({ state: "visible", timeout: 20_000 });

    const checkbox = row.locator('button[role="checkbox"]').first();
    await ch.shot(page, "scheduler-list", [
      { at: checkbox },
      { at: page.getByRole("button", { name: /^Create plan/i }).first(), badge: "top-right" },
    ]);
    await checkbox.check();

    await page.getByRole("button", { name: /^Create plan/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    await ch.shot(page, "plan-dialog-empty", [
      { at: dialog.getByRole("button", { name: WORKERS.cutting, exact: false }).first() },
    ]);

    for (const name of [
      WORKERS.cutting,
      WORKERS.sewing,
      WORKERS.finishing,
      WORKERS.ironing,
      WORKERS.quality_check,
    ]) {
      const chip = dialog.getByRole("button", { name, exact: false }).first();
      await chip.waitFor({ state: "visible", timeout: 10_000 });
      if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
    }

    const scheduleBtn = dialog.getByRole("button", { name: /^Schedule$/i });
    await ch.shot(page, "plan-dialog-filled", [
      { at: dialog.getByRole("button", { name: WORKERS.sewing, exact: false }).first() },
      { at: scheduleBtn, badge: "top-right" },
    ]);

    await scheduleBtn.click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
    await waitForDb(
      async () => (await garmentStage(order.garmentUuid)).piece_stage === "cutting",
      "scheduled into cutting",
    );
    ch.close();
  }

  // ── CHAPTER 6 — production and QC ────────────────────────────────────────────
  // SEEDED for now: the per-station terminals and the full QC form each deserve
  // their own chapter with their own captures. This advances the piece so the
  // chapters downstream of QC have something real to show.
  await advanceProductionToQc(order.garmentUuid);
  await passQc(order.garmentUuid);

  // ── CHAPTER 7 — the workshop sends it back ───────────────────────────────────
  {
    const ch = chapter({ id: "07-workshop-dispatch", order: 7, app: "workshop" });

    await page.goto(`${WORKSHOP_BASE_URL}/dispatch`);
    const card = page.locator("div.rounded-md", { hasText: `Order ${order.orderId}` }).first();
    await card.waitFor({ state: "visible", timeout: 20_000 });

    const btn = card.getByRole("button", { name: /^Dispatch/i });
    await ch.shot(page, "ready-tab", [{ at: btn, badge: "top-right" }]);

    await btn.click();
    await waitForDb(
      async () => (await garmentStage(order.garmentUuid)).location === "transit_to_shop",
      "dispatched back to shop",
    );
    ch.close();
  }

  // ── CHAPTER 8 — the shop receives it ─────────────────────────────────────────
  // Finals land ready_for_pickup. A brova would land awaiting_trial instead — and
  // that fork is where the brova-trial chapter picks up.
  {
    const ch = chapter({ id: "08-shop-receive", order: 8, app: "shop" });

    await clearSession(page, POS_BASE_URL);
    await loginShop(page, USERS.orderTaker, "/erth");
    await page.goto(`${POS_BASE_URL}/erth/orders/order-management/receiving-brova-final`);

    const card = page
      .locator("div.rounded-lg", { hasText: `INV ${order.invoiceNumber}` })
      .filter({ hasText: GUIDE_CUSTOMER.name })
      .first();
    await card.waitFor({ state: "visible", timeout: 20_000 });

    const btn = card.getByRole("button", { name: /^Receive/i });
    await ch.shot(page, "receiving-list", [{ at: btn, badge: "top-right" }]);

    await btn.click();
    await waitForDb(async () => {
      const g = await garmentStage(order.garmentUuid);
      return g.location === "shop" && g.piece_stage === "ready_for_pickup";
    }, "received at shop");
    ch.close();
  }

  // ── CHAPTER 9 — handover ─────────────────────────────────────────────────────
  // Deliberately NOT gated on payment. The cashier may hand over with a balance
  // outstanding; that is staff judgment, per SPEC §3.
  {
    const ch = chapter({ id: "09-handover", order: 9, app: "shop" });

    await clearSession(page, POS_BASE_URL);
    await loginShop(page, USERS.cashier, "/erth");
    await page.goto(`${POS_BASE_URL}/erth/cashier/${order.orderId}`);

    const handoverPill = page.getByRole("button", { name: /^Handover$/i });
    await handoverPill.waitFor({ state: "visible", timeout: 20_000 });
    await ch.shot(page, "order-detail", [{ at: handoverPill }]);
    await handoverPill.click();

    const check = page.getByRole("checkbox", { name: "Select garment" }).first();
    const collect = page.getByRole("button", { name: /Collect \d+ garment/i });
    await check.check();
    await ch.shot(page, "handover-tab", [{ at: check }, { at: collect, badge: "top-right" }]);

    await collect.click();
    await waitForDb(
      async () => (await garmentStage(order.garmentUuid)).piece_stage === "completed",
      "collected",
    );

    await page.reload();
    await ch.shot(page, "completed");
    ch.close();
  }

  // TODO(next): chapter 01 (new-work-order form) needs the form driven rather than
  // seeded, and chapter 06 needs the station terminals + QC form captured. Both are
  // additive: they slot into the same manifest without touching the chapters here.
});
