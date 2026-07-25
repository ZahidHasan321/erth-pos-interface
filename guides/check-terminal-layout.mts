/**
 * Layout integrity check for the terminal overlay.
 *
 * The body-template cells are absolutely positioned with a fixed width/height
 * from quality-check-field-layout, so adding a second stacked line (the red
 * superseded value) can overflow the box or collide with a neighbouring cell.
 * Eyeballing a downscaled screenshot will not catch that - measure it.
 *
 * Reports, per case and per viewport:
 *   OVERFLOW - content taller/wider than its own cell box
 *   OVERLAP  - two cells whose rects intersect
 */
import { chromium, type Page } from "@playwright/test";
import postgres from "postgres";

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const APP = "http://127.0.0.1:5174";
const sql = postgres(DB);

const [g] = await sql<{ id: string; order_id: number }[]>`
  SELECT id, order_id FROM garments ORDER BY order_id, garment_id LIMIT 1
`;
if (!g) throw new Error("no seeded garment");

async function reset() {
  await sql`DELETE FROM garment_feedback WHERE garment_id = ${g.id}`;
  await sql`
    UPDATE measurements SET chest_front = 21, sleeve_length = 24, collar_width = 16
    WHERE id = (SELECT measurement_id FROM garments WHERE id = ${g.id})
  `;
  await sql`
    UPDATE garments SET garment_type='final', trip_number=1, trip_history=NULL,
      piece_stage='sewing', location='workshop', in_production=true,
      alteration_measurements=NULL, alteration_styles=NULL,
      original_garment_id=NULL, lines=1
    WHERE id = ${g.id}
  `;
}

/** The everyday shape of a QC fail: a couple of measurements off. If this
 *  overflows, the dense case is not a strawman. */
async function applyRealisticQcFail() {
  await sql`
    UPDATE garments SET trip_history = ${sql.json([
      {
        trip: 1,
        qc_attempts: [
          {
            inspector: "QC", date: "2026-07-18", result: "fail", trip: 1, attempt_number: 1,
            measurements: { chest_front: 23, sleeve_length: 26.5, collar_width: 16.5 },
            options: {}, quality_ratings: {},
            failed_measurements: ["chest_front", "sleeve_length", "collar_width"],
            failed_options: [], failed_quality: [],
            return_stages: ["sewing"], defect_attributions: null,
          },
        ],
      },
    ])} WHERE id = ${g.id}
  `;
}

/** QC fail across MANY fields at once - the worst case for collisions. */
async function applyDenseQcFail() {
  const failed = [
    "collar_width", "collar_height", "shoulder", "sleeve_length", "elbow",
    "chest_upper", "chest_front", "chest_back", "waist_front", "waist_back",
    "length_front", "length_back", "bottom", "sleeve_width", "armhole_front",
    "side_pocket_distance", "side_pocket_opening", "sleeve_hemming", "bottom_hemming",
  ];
  // Every reading off by a fraction, so each cell renders a two-line value.
  const measurements = Object.fromEntries(failed.map((k) => [k, 33.5]));
  await sql`
    UPDATE garments SET trip_history = ${sql.json([
      {
        trip: 1,
        qc_attempts: [
          {
            inspector: "QC", date: "2026-07-18", result: "fail", trip: 1, attempt_number: 1,
            measurements, options: {}, quality_ratings: {},
            failed_measurements: failed, failed_options: [], failed_quality: [],
            return_stages: ["sewing"], defect_attributions: null,
          },
        ],
      },
    ])} WHERE id = ${g.id}
  `;
}

interface Box { key: string; x: number; y: number; w: number; h: number; overflowY: number; overflowX: number }

async function measure(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    // Body-template cells are the absolutely-positioned children of the
    // container-query root that holds the template <img>.
    const img = document.querySelector('img[alt="Measurement template"]');
    const root = img?.parentElement;
    if (!root) return [];
    const out: Box[] = [];
    for (const el of Array.from(root.children)) {
      if (el === img) continue;
      const h = el as HTMLElement;
      const r = h.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out.push({
        key: (h.textContent || "").trim().slice(0, 14) || "(blank)",
        x: r.x, y: r.y, w: r.width, h: r.height,
        // scroll* vs client* reveals content escaping its own padding box.
        overflowY: h.scrollHeight - h.clientHeight,
        overflowX: h.scrollWidth - h.clientWidth,
      });
    }
    return out;
  });
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const browser = await chromium.launch();
const VIEWPORTS = [
  { name: "landscape-1600x1000", width: 1600, height: 1000 },
  { name: "tablet-portrait-1080x1440", width: 1080, height: 1440 },
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

  for (const [label, apply] of [
    ["baseline-normal", async () => {}],
    ["realistic-qc-fail", applyRealisticQcFail],
    ["dense-qc-fail", applyDenseQcFail],
  ] as const) {
    await reset();
    await apply();
    await page.goto(`${APP}/terminals/garment/${g.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const boxes = await measure(page);
    const overflowing = boxes.filter((b) => b.overflowY > 1 || b.overflowX > 1);
    const collisions: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (overlaps(boxes[i]!, boxes[j]!)) {
          collisions.push(`"${boxes[i]!.key}" x "${boxes[j]!.key}"`);
        }
      }
    }
    // The frame deliberately overshoots its column in portrait to spend the
    // template's dead side margin, and the wrapper clips the overflow. That is
    // only safe while every CELL stays inside the wrapper - assert it.
    const clipped = await page.evaluate(() => {
      const img = document.querySelector('img[alt="Measurement template"]');
      const root = img?.parentElement;
      const wrap = root?.parentElement?.parentElement;
      if (!root || !wrap) return [];
      const w = wrap.getBoundingClientRect();
      const out: string[] = [];
      for (const el of Array.from(root.children)) {
        if (el === img) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.left < w.left - 0.5 || r.right > w.right + 0.5 || r.top < w.top - 0.5 || r.bottom > w.bottom + 0.5) {
          out.push(`${(el.textContent || "").trim().slice(0, 10)}`);
        }
      }
      return out;
    });

    const heights = boxes.map((b) => Math.round(b.h));
    console.log(`\n=== ${vp.name} / ${label} ===`);
    console.log(`CLIPPED:  ${clipped.length}`, clipped.slice(0, 8).join(" "));
    console.log(`cells=${boxes.length} heights=[${[...new Set(heights)].sort((a, b) => a - b).join(", ")}]`);
    console.log(`OVERFLOW: ${overflowing.length}`, overflowing.slice(0, 6).map((b) => `${b.key}(+${b.overflowY}px)`).join(" "));
    console.log(`OVERLAP:  ${collisions.length}`, collisions.slice(0, 6).join(" | "));

    await page.screenshot({
      path: `out/terminal-states/layout-${vp.name}-${label}.png`,
      clip: { x: 0, y: 0, width: Math.min(vp.width, 1200), height: Math.min(vp.height, 1400) },
    });
  }
  await ctx.close();
}

await reset();
await browser.close();
await sql.end();
