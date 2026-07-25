/**
 * Portrait capture for the terminal overlay, at real Android-tablet sizes.
 * The production terminal is used on tablets held portrait, which is the
 * layout this file exists to check.
 */
import { chromium } from "@playwright/test";
import postgres from "postgres";

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const APP = "http://127.0.0.1:5174";
const sql = postgres(DB);

const [g] = await sql<{ id: string }[]>`
  SELECT id FROM garments ORDER BY order_id, garment_id LIMIT 1
`;
if (!g) throw new Error("no seeded garment");

async function reset() {
  await sql`
    UPDATE garments SET garment_type='final', trip_number=1, trip_history=NULL,
      piece_stage='sewing', location='workshop', in_production=true,
      alteration_measurements=NULL, alteration_styles=NULL,
      original_garment_id=NULL, lines=1
    WHERE id = ${g.id}
  `;
}

async function qcFail() {
  await sql`
    UPDATE garments SET trip_history = ${sql.json([
      {
        trip: 1,
        qc_attempts: [
          {
            inspector: "QC", date: "2026-07-18", result: "fail", trip: 1, attempt_number: 1,
            measurements: { chest_front: 23, sleeve_length: 26.5 },
            options: { collar_button: null, lines: 2 },
            quality_ratings: { seam: 2 },
            failed_measurements: ["chest_front", "sleeve_length"],
            failed_options: ["collar_button", "lines"],
            failed_quality: ["seam"],
            return_stages: ["sewing"], defect_attributions: null,
          },
        ],
      },
    ])} WHERE id = ${g.id}
  `;
}

const browser = await chromium.launch();
// Common Android tablet portrait sizes (CSS px).
const VIEWPORTS = [
  { name: "portrait-1200x1920", width: 1200, height: 1920 },
  { name: "portrait-800x1280", width: 800, height: 1280 },
];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2, reducedMotion: "reduce", timezoneId: "Asia/Kuwait",
  });
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.locator("#ws-username").fill("e2e_wsadmin");
  await page.locator("#ws-pin").fill("123456");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20_000 });

  for (const [label, apply] of [["normal", reset], ["qc-fix", qcFail]] as const) {
    await reset();
    await apply();
    await page.goto(`${APP}/terminals/garment/${g.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    // Does the page scroll? On a terminal it must not.
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 2,
    );
    console.log(`${vp.name}/${label} pageScrolls=${scrolls}`);
    await page.screenshot({ path: `out/terminal-states/${vp.name}-${label}.png` });
  }
  await ctx.close();
}

await reset();
await browser.close();
await sql.end();
