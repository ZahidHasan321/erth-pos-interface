/**
 * Throwaway capture harness for the terminal error-display work.
 *
 * Drives ONE seeded garment through the four states the overlay must render
 * consistently (normal / feedback alteration / QC fix / alteration-out) by
 * writing the state directly to the LOCAL disposable DB, then screenshots the
 * production terminal for each.
 *
 * Local only: DB is 127.0.0.1:54322, app is the vite dev server on :5174.
 */
import { chromium } from "@playwright/test";
import postgres from "postgres";

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const APP = "http://127.0.0.1:5174";
const OUT = "out/terminal-states";

const sql = postgres(DB);

const [g] = await sql<{ id: string; order_id: number }[]>`
  SELECT id, order_id FROM garments ORDER BY order_id, garment_id LIMIT 1
`;
if (!g) throw new Error("no seeded garment in the local DB - run pnpm e2e:setup");

/**
 * A second garment standing in for the ORIGINAL we altered, carrying the
 * pre-alteration measurement. Created once, reused across runs.
 */
let cachedSourceId: string | null = null;
async function sourceGarmentId(): Promise<string> {
  if (cachedSourceId) return cachedSourceId;
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM garments WHERE garment_id = 'SRC' LIMIT 1
  `;
  if (existing) return (cachedSourceId = existing.id);

  const [meas] = await sql<{ id: string }[]>`
    INSERT INTO measurements (customer_id, measurement_date, type, reference,
                              chest_front, sleeve_length, collar_width, collar_height,
                              shoulder, length_front, length_back, bottom)
    VALUES (1, '2026-01-10', 'Body', 'ALT-SOURCE', 21, 24, 16, 2, 18, 56, 57, 24)
    RETURNING id
  `;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO garments (garment_id, order_id, garment_type, piece_stage, location,
                          measurement_id, style, lines, fabric_id)
    VALUES ('SRC', ${g.order_id}, 'final', 'completed', 'shop',
            ${meas!.id}, 'kuwaiti', 1, 1)
    RETURNING id
  `;
  return (cachedSourceId = row!.id);
}

/** Reset to a clean single-trip final before each case. */
async function reset() {
  await sql`DELETE FROM garment_feedback WHERE garment_id = ${g.id}`;
  // Case 2 rewrites the spec the way a real feedback submit does - put it back.
  await sql`
    UPDATE measurements SET chest_front = 21, sleeve_length = 24, collar_width = 16
    WHERE id = (SELECT measurement_id FROM garments WHERE id = ${g.id})
  `;
  await sql`
    UPDATE garments SET
      garment_type = 'final', trip_number = 1, trip_history = NULL,
      piece_stage = 'sewing', location = 'workshop', in_production = true,
      alteration_measurements = NULL, alteration_styles = NULL,
      original_garment_id = NULL,
      lines = 1
    WHERE id = ${g.id}
  `;
}

const CASES: Record<string, () => Promise<void>> = {
  "1-normal": async () => {
    /* reset() alone is the normal state */
  },

  "2-feedback-alteration": async () => {
    // A real feedback submit rewrites the target spec, so the garment's own
    // measurement already carries the NEW values and the diff holds the old
    // ones. Mirror that, or the overlay is comparing a value against itself.
    await sql`UPDATE garments SET trip_number = 2 WHERE id = ${g.id}`;
    await sql`
      UPDATE measurements SET chest_front = 22.5, sleeve_length = 25, collar_width = 16.5
      WHERE id = (SELECT measurement_id FROM garments WHERE id = ${g.id})
    `;
    await sql`
      INSERT INTO garment_feedback (garment_id, order_id, feedback_type, action, trip_number, measurement_diffs, options_checklist)
      VALUES (
        ${g.id}, ${g.order_id}, 'brova_trial', 'accept_with_fix', 1,
        ${JSON.stringify([
          { field: "chest_front", original_value: 21, actual_value: 22.5, reason: "Customer Request" },
          { field: "sleeve_length", original_value: 24, actual_value: 25, reason: "Shop Error" },
          { field: "shoulder", original_value: 18, actual_value: null, reason: "Workshop Error" },
          { field: "collar_width", original_value: 16, actual_value: 16.5, reason: "Customer Request" },
        ])},
        ${JSON.stringify([
          { option_name: "collar", expected_value: "COL_DOWN_COLLAR", new_value: "COL_JAPANESE", rejected: true },
          { option_name: "penHolder", expected_value: "No", rejected: true },
          { option_name: "lines", expected_value: "1", new_value: "2", rejected: true },
        ])}
      )
    `;
  },

  "3-qc-fix": async () => {
    await sql`
      UPDATE garments SET trip_history = ${sql.json([
        {
          trip: 1,
          qc_attempts: [
            {
              inspector: "QC", date: "2026-07-18", result: "fail", trip: 1, attempt_number: 1,
              measurements: { chest_front: 23, sleeve_length: 26.5 },
              options: { collar_button: null, lines: 2 },
              quality_ratings: { seam: 2, ironing: 3, collar: 5, jabzour: 5, front_pocket: 5, hemming: 5 },
              failed_measurements: ["chest_front", "sleeve_length"],
              failed_options: ["collar_button", "lines"],
              failed_quality: ["seam", "ironing"],
              return_stages: ["sewing", "ironing"],
              defect_attributions: null,
            },
          ],
        },
      ])} WHERE id = ${g.id}
    `;
  },

  "4-alteration-out-internal": async () => {
    // Internal links a DIFFERENT prior garment (a self-link is not a real
    // shape and PostgREST will not embed it), so the source measurement is
    // what supplies each cell's superseded value.
    await sql`
      UPDATE garments SET
        garment_type = 'alteration',
        original_garment_id = ${await sourceGarmentId()},
        alteration_measurements = ${sql.json({ chest_front: 23, sleeve_length: 25.5 })},
        alteration_styles = ${sql.json({ collar_type: "COL_JAPANESE" })}
      WHERE id = ${g.id}
    `;
  },

  "5-alteration-out-external": async () => {
    await sql`
      UPDATE garments SET
        garment_type = 'alteration',
        original_garment_id = NULL,
        alteration_measurements = ${sql.json({ chest_front: 23, sleeve_length: 25.5 })},
        alteration_styles = ${sql.json({ collar_type: "COL_JAPANESE" })}
      WHERE id = ${g.id}
    `;
  },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
  timezoneId: "Asia/Kuwait",
});
const page = await ctx.newPage();

// Log in once (PIN login writes the session to localStorage).
// Same selectors as e2e/fixtures/login.ts (#ws-username / #ws-pin).
await page.goto(`${APP}/login`);
await page.locator("#ws-username").fill("e2e_wsadmin");
await page.locator("#ws-pin").fill("123456");
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20_000 });

for (const [name, apply] of Object.entries(CASES)) {
  await reset();
  await apply();
  await page.goto(`${APP}/terminals/garment/${g.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("captured", name);
}

await reset();
await browser.close();
await sql.end();
