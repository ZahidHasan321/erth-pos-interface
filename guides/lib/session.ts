/**
 * Session + DB-wait utilities for the guide walk.
 *
 * NOTE: these are lifted from e2e/tests/lifecycle-initial.spec.ts, where they are
 * currently private to the test file. They are duplicated here rather than
 * extracted so this change does not touch a working test. If the guide sticks,
 * the right cleanup is to move all three into e2e/helpers/ui.ts and have both
 * callers import them — the retry logic in clearSession is subtle enough that two
 * copies WILL drift.
 */
import type { Page } from "@playwright/test";
import { getDb } from "../../e2e/helpers/db";

/** Wait until a DB predicate holds (the UI mutation has landed), or fail. */
export async function waitForDb(
  poll: () => Promise<boolean>,
  label: string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await poll()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitForDb timed out: ${label}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

export async function garmentStage(garmentUuid: string): Promise<{
  location: string;
  piece_stage: string;
  trip_number: number;
  in_production: boolean;
}> {
  const sql = getDb();
  const [g] = await sql<
    {
      location: string;
      piece_stage: string;
      trip_number: number;
      in_production: boolean;
    }[]
  >`
    SELECT location, piece_stage, trip_number, in_production
    FROM garments WHERE id = ${garmentUuid}
  `;
  if (!g) throw new Error(`garmentStage: garment ${garmentUuid} not found`);
  return g;
}

/**
 * Clear the Supabase GoTrue session for an origin so the next login starts cold.
 * The guide switches actors constantly (cashier -> order-taker -> cashier); without
 * this the still-authenticated session makes /login redirect to the brand picker
 * and the login form never renders.
 */
export async function clearSession(page: Page, baseUrl: string): Promise<void> {
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
    try {
      window.localStorage.clear();
    } catch {
      /* origin not accessible yet */
    }
    try {
      window.sessionStorage.clear();
    } catch {
      /* */
    }
  });
}
