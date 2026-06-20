import { test, expect } from "@playwright/test";
import { loginShop, loginWorkshop } from "../fixtures/login";
import { USERS } from "../config";

/**
 * Foundation smoke: prove the real PIN login UI works end to end against the
 * local Supabase stack for BOTH apps. Each test drives the actual form, submits,
 * and asserts the app lands on its authenticated landing route (a stable route,
 * not pixels).
 */

test.describe("auth smoke", () => {
  test("pos-interface: order-taker logs in and lands on the showroom dashboard", async ({
    page,
  }) => {
    await loginShop(page, USERS.orderTaker, "/erth");

    // Landed on the brand-scoped dashboard route, not bounced back to /login.
    await expect(page).toHaveURL(/\/erth$/);
    await expect(page).not.toHaveURL(/\/login/);
    // The /$main/ dashboard route sets the document title to "Dashboard".
    await expect(page).toHaveTitle(/Dashboard/i);
  });

  test("workshop: terminal user logs in and lands on their terminal", async ({
    page,
  }) => {
    await loginWorkshop(page, USERS.workshop, "/terminals/cutting");

    // Terminal user (cutter) is routed straight to their own terminal.
    await expect(page).toHaveURL(/\/terminals\/cutting$/);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).not.toHaveURL(/\/access-denied/);
    await expect(page).toHaveTitle(/Cutting Terminal/i);
  });
});
