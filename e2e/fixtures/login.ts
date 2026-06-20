/**
 * Per-role login helpers that drive the REAL PIN UI of each app.
 *
 * These exercise the actual auth wiring (login_with_pin RPC → GoTrue
 * signInWithPassword), the whole point of the harness. `storageState()` returns
 * the post-login session so later phases can reuse a logged-in context instead
 * of re-driving the form every test.
 */
import type { Page, BrowserContext } from "@playwright/test";
import {
  POS_BASE_URL,
  WORKSHOP_BASE_URL,
  PIN,
  USERS,
} from "../config";

/** Shop login form (pos-interface /login): #username-input + #pin-input. */
export async function loginShop(
  page: Page,
  user: { username: string },
  expectedPathSuffix: string,
): Promise<void> {
  await page.goto(`${POS_BASE_URL}/login`);
  await page.locator("#username-input").fill(user.username);
  await page.locator("#pin-input").fill(PIN);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(new RegExp(`${escapeRe(expectedPathSuffix)}$`), {
    timeout: 20_000,
  });
}

/** Workshop login form (workshop /login): #ws-username + #ws-pin. */
export async function loginWorkshop(
  page: Page,
  user: { username: string },
  expectedPathSuffix: string,
): Promise<void> {
  await page.goto(`${WORKSHOP_BASE_URL}/login`);
  await page.locator("#ws-username").fill(user.username);
  await page.locator("#ws-pin").fill(PIN);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(new RegExp(`${escapeRe(expectedPathSuffix)}$`), {
    timeout: 20_000,
  });
}

/** Log the order-taker into the shop app and persist the session. */
export async function loginAsOrderTaker(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  await loginShop(page, USERS.orderTaker, "/erth");
  await context.storageState();
  await page.close();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
