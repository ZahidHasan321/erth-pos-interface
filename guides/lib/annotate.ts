/**
 * Screen annotation for guide captures.
 *
 * We paint the callouts as a DOM overlay INSIDE the page and let Chromium render
 * them, rather than post-processing the PNG with an image library. That buys us
 * exact element geometry for free (getBoundingClientRect), correct behaviour when
 * the page has scrolled, crisp text at any device scale factor, and zero image
 * dependencies. Playwright's built-in `mask` option only blacks regions out, which
 * is the opposite of what a training guide needs.
 *
 * The badges carry NUMBERS ONLY, never words. That is deliberate: it is what lets
 * a single capture run serve every language. The prose that explains "1" lives in
 * locales/<lang>.json and is rendered beside the image, so adding a language costs
 * a JSON file rather than a re-run.
 */
import type { Locator, Page } from "@playwright/test";

const OVERLAY_ID = "__guide_overlay__";

/** A thing to point at: a locator, plus an optional nudge for badge placement. */
export type Mark = {
  at: Locator;
  /** Where the numbered badge sits relative to the box. Default "top-left". */
  badge?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

type Rect = { x: number; y: number; w: number; h: number; badge: string };

/**
 * Resolve each mark to viewport coordinates, then paint the overlay.
 *
 * Resolution happens in Node (not in `evaluate`) so marks can use the full
 * Playwright locator API — getByRole, filter, nth — instead of being limited to
 * CSS selector strings.
 */
export async function paintMarks(page: Page, marks: Mark[]): Promise<void> {
  if (marks.length === 0) return;

  // Bring the first mark into view; the rest are measured wherever they land.
  await marks[0]!.at.scrollIntoViewIfNeeded().catch(() => {
    /* off-screen or detached — measured below, skipped if null */
  });

  const rects: Rect[] = [];
  for (const m of marks) {
    // Fail FAST and loudly. boundingBox() on its own blocks until the whole test
    // times out, which turns "this callout points at nothing" into a five-minute
    // wait and an error naming the wrong line. A mark that is not on screen is
    // always an authoring bug, so give it a short fuse and a useful message.
    try {
      await m.at.waitFor({ state: "visible", timeout: 5_000 });
    } catch (e) {
      // Surface the REAL cause. Swallowing it turns a strict-mode violation
      // ("this locator matched 3 elements") into a misleading "not visible",
      // which sends you hunting for a timing bug that isn't there.
      const why = e instanceof Error ? e.message.split("\n")[0] : String(e);
      const n = await m.at.count().catch(() => -1);
      throw new Error(
        `paintMarks: mark ${rects.length + 1} of ${marks.length} could not be resolved ` +
          `(matched ${n} element(s)). A guide must never point at something the reader ` +
          `cannot see. Underlying: ${why}`,
      );
    }
    const box = await m.at.boundingBox();
    if (!box) {
      throw new Error(
        `paintMarks: mark ${rects.length + 1} resolved to no box (zero-sized or detached).`,
      );
    }
    rects.push({
      x: box.x,
      y: box.y,
      w: box.width,
      h: box.height,
      badge: m.badge ?? "top-left",
    });
  }

  await page.evaluate(
    ({ rects, id }) => {
      document.getElementById(id)?.remove();

      const layer = document.createElement("div");
      layer.id = id;
      Object.assign(layer.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        pointerEvents: "none",
        font: "600 15px/1 ui-sans-serif, system-ui, -apple-system, sans-serif",
      });

      const ACCENT = "#e11d48";
      const PAD = 4;

      rects.forEach((r, i) => {
        const box = document.createElement("div");
        Object.assign(box.style, {
          position: "absolute",
          left: `${r.x - PAD}px`,
          top: `${r.y - PAD}px`,
          width: `${r.w + PAD * 2}px`,
          height: `${r.h + PAD * 2}px`,
          border: `2px solid ${ACCENT}`,
          borderRadius: "6px",
          boxShadow: `0 0 0 3px rgba(225,29,72,.18)`,
        });
        layer.appendChild(box);

        const badge = document.createElement("div");
        badge.textContent = String(i + 1);
        const SIZE = 24;
        const vert = r.badge.startsWith("top")
          ? `${r.y - PAD - SIZE / 2}px`
          : `${r.y + r.h + PAD - SIZE / 2}px`;
        const horiz = r.badge.endsWith("left")
          ? `${r.x - PAD - SIZE / 2}px`
          : `${r.x + r.w + PAD - SIZE / 2}px`;
        Object.assign(badge.style, {
          position: "absolute",
          top: vert,
          left: horiz,
          width: `${SIZE}px`,
          height: `${SIZE}px`,
          borderRadius: "999px",
          background: ACCENT,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.35)",
        });
        layer.appendChild(badge);
      });

      document.body.appendChild(layer);
    },
    { rects, id: OVERLAY_ID },
  );
}

/** Strip the overlay so the page stays usable for the next action. */
export async function clearMarks(page: Page): Promise<void> {
  await page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY_ID);
}
