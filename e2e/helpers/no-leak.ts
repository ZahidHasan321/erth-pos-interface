/**
 * The no-leak ORACLE for the cross-app e2e suite.
 *
 * After every lifecycle step we re-read the order's garments from the COMMITTED
 * local DB, map them into SurfaceGarment, and assert isGarmentLeaked === false
 * for each — i.e. every garment the workshop is responsible for is rendered in at
 * least one actionable surface (receiving / parking / scheduler / a terminal /
 * soak / dispatch), or is in a terminal state. A garment that is in the workshop
 * universe, not terminal, yet in NO surface is "leaked" — invisible, un-actionable.
 *
 * This mirrors packages/database/src/__tests__/workflow.no-leak.test.ts's
 * assertNoLeak (same column selection, same oracle), but reads via getDb() against
 * the live DB the UI mutated, instead of a rolled-back driver tx. The oracle
 * itself (isGarmentLeaked / buildSurfaceContext) is imported from @repo/database —
 * the single source of truth for surface membership.
 */
import { expect } from "@playwright/test";
// Import the oracle from the leaf source module rather than the @repo/database
// barrel. The barrel (src/index.ts) `export *`s across many files (drizzle schema,
// utils, …); under Playwright's loader the re-exported named bindings don't
// survive, so we point straight at the source of truth (explicit .ts so the
// Node ESM resolver finds the un-built TS file in the linked workspace package).
import {
  type SurfaceGarment,
  buildSurfaceContext,
  isGarmentLeaked,
  classifyGarmentSurfaces,
} from "@repo/database/src/workshop-surfaces.ts";
import { getDb } from "./db";

/** A garment row enriched with the human garment_id for legible failures. */
type Row = SurfaceGarment & { garment_id: string };

/** Read the order's garments with exactly the fields the surface oracle reads. */
async function surfaceRows(orderId: number): Promise<Row[]> {
  const sql = getDb();
  return (await sql`
    SELECT id, garment_id, order_id, location, in_production, piece_stage, trip_number,
           garment_type, express, soaking, soaking_completed_at, production_plan,
           feedback_status, acceptance_status, start_time
    FROM garments WHERE order_id = ${orderId}
  `) as unknown as Row[];
}

/**
 * Assert no garment in the order is invisible RIGHT NOW. Fails loudly with the
 * full state of any leaked garment so a regression is diagnosable without a
 * debugger. Returns the rows so a caller can additionally assert per-garment
 * location/stage/trip in the same read.
 */
export async function assertNoLeak(orderId: number, label: string): Promise<Row[]> {
  const rows = await surfaceRows(orderId);
  const ctx = buildSurfaceContext(rows);
  const leaked = rows.filter((g) => isGarmentLeaked(g, ctx));
  expect(
    leaked,
    `[${label}] ${leaked.length} leaked garment(s) — in the workshop universe, ` +
      `not terminal, yet in NO actionable surface:\n${JSON.stringify(leaked, null, 2)}`,
  ).toEqual([]);
  return rows;
}

/**
 * Assert a single garment's DB position matches the step's expectation, AND that
 * the order has no leak. `surfaces` (optional) asserts the exact set of actionable
 * surfaces the garment renders in (bonus visibility check — proves it's not just
 * "not leaked" but in the RIGHT queue).
 */
export async function assertGarmentAt(
  orderId: number,
  garmentUuid: string,
  expected: {
    label: string;
    location?: string;
    piece_stage?: string;
    trip_number?: number;
    surfaces?: string[];
  },
): Promise<void> {
  const rows = await assertNoLeak(orderId, expected.label);
  const g = rows.find((r) => r.id === garmentUuid);
  expect(g, `[${expected.label}] garment ${garmentUuid} not found in order ${orderId}`).toBeTruthy();
  if (!g) return;

  const where = `[${expected.label}] garment ${g.garment_id}`;
  if (expected.location !== undefined) {
    expect(g.location, `${where}: location`).toBe(expected.location);
  }
  if (expected.piece_stage !== undefined) {
    expect(g.piece_stage, `${where}: piece_stage`).toBe(expected.piece_stage);
  }
  if (expected.trip_number !== undefined) {
    expect(g.trip_number, `${where}: trip_number`).toBe(expected.trip_number);
  }
  if (expected.surfaces !== undefined) {
    const ctx = buildSurfaceContext(rows);
    const got = classifyGarmentSurfaces(g, ctx).sort();
    expect(got, `${where}: actionable surfaces`).toEqual([...expected.surfaces].sort());
  }
}
