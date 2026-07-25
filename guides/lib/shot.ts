/**
 * Capture layer: takes the annotated screenshot and records what it was.
 *
 * A chapter writes its own manifest sidecar (out/manifest/<chapter>.json) rather
 * than all chapters appending to one file, so parallel capture runs can never race
 * on it. The renderer globs the sidecars back together.
 *
 * The manifest deliberately carries NO prose — only step ids, the image path, and
 * how many marks the shot has. Prose lives in locales/<lang>.json. That separation
 * is what makes en/hi render from one capture run.
 */
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { paintMarks, clearMarks, type Mark } from "./annotate";

const OUT = new URL("../out/", import.meta.url).pathname;
const SHOTS = path.join(OUT, "shots");
const MANIFEST = path.join(OUT, "manifest");

export type StepRecord = {
  id: string;
  image: string;
  marks: number;
  /** Which app the reader is in, so the renderer can show the right chrome. */
  app: "shop" | "workshop";
  /** Route the reader should be on, shown as a breadcrumb above the shot. */
  route: string;
};

export type ChapterRecord = {
  id: string;
  order: number;
  app: "shop" | "workshop";
  steps: StepRecord[];
};

/**
 * Open a chapter. Returns a `shot` fn bound to it and a `close` fn that flushes
 * the sidecar. Step ids are namespaced by chapter, which is also the locale key:
 *   locales/en.json -> { "dispatch.select-order": { title, body } }
 */
export function chapter(opts: {
  id: string;
  order: number;
  app: "shop" | "workshop";
}) {
  const steps: StepRecord[] = [];

  // Wipe this chapter's images up front. Without this, renaming or dropping a
  // step leaves its PNG behind, and the stale file looks identical to a live one
  // on disk — the manifest is the only thing that knows it is orphaned.
  const chapterDir = path.join(SHOTS, opts.id);
  fs.rmSync(chapterDir, { recursive: true, force: true });

  // Set when an action opens a dialog that has not been captured yet. A guide
  // that clicks through a confirmation without showing it teaches the reader to
  // hit a wall they were never warned about, so this is enforced rather than
  // left to whoever is authoring the chapter to remember.
  let uncaptured: string | null = null;

  const self = {
    /**
     * Perform an action, then refuse to move on if it opened a dialog nobody shot.
     *
     * Use this for every click that might confirm, warn, or ask something. The
     * next call must be shot(); otherwise this throws and names the dialog.
     */
    async act(page: Page, target: Locator, what: string): Promise<void> {
      if (uncaptured) {
        throw new Error(
          `act("${what}") while the "${uncaptured}" dialog is still uncaptured. ` +
            `Shoot it before clicking on — a confirmation the reader never sees is a ` +
            `step they hit blind.`,
        );
      }
      await target.click();

      const dialog = page.getByRole("dialog").first();
      if (await dialog.isVisible().catch(() => false)) {
        const title =
          (await dialog.textContent().catch(() => ""))?.trim().slice(0, 60) ?? "dialog";
        uncaptured = title;
      }
    },

    /** Escape hatch: this dialog is genuinely not worth a step. Say why. */
    skipDialog(why: string): void {
      if (!uncaptured) throw new Error(`skipDialog("${why}") but no dialog is open.`);
      uncaptured = null;
    },

    /**
     * Annotate the current screen and capture it.
     *
     * `marks` are the numbered callouts, in reading order — the number a reader
     * sees is the index in this array, so the locale body for the step should
     * refer to them as 1, 2, 3.
     */
    async shot(
      page: Page,
      stepId: string,
      marks: Mark[] = [],
    ): Promise<void> {
      const id = `${opts.id}.${stepId}`;
      const file = `${String(steps.length + 1).padStart(2, "0")}-${stepId}.png`;
      const dir = path.join(SHOTS, opts.id);
      fs.mkdirSync(dir, { recursive: true });

      await settle(page);
      await paintMarks(page, marks);
      await page.screenshot({ path: path.join(dir, file), scale: "css" });
      await clearMarks(page);

      steps.push({
        id,
        image: `shots/${opts.id}/${file}`,
        marks: marks.length,
        app: opts.app,
        route: new URL(page.url()).pathname,
      });
      uncaptured = null;
    },

    close(): void {
      if (uncaptured) {
        throw new Error(
          `chapter "${opts.id}" ends with the "${uncaptured}" dialog uncaptured.`,
        );
      }
      fs.mkdirSync(MANIFEST, { recursive: true });
      const record: ChapterRecord = {
        id: opts.id,
        order: opts.order,
        app: opts.app,
        steps,
      };
      fs.writeFileSync(
        path.join(MANIFEST, `${opts.id}.json`),
        JSON.stringify(record, null, 2),
      );
    },
  };

  return self;
}

/**
 * Quiet the page before a capture.
 *
 * Without this the guide re-shoots differently on every run: framer-motion is a
 * pos-interface dependency, and a half-played transition or a still-spinning
 * skeleton produces a different PNG each time. We wait for the network to go idle
 * and for fonts to load, then let one more frame paint.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => {
    /* long-poll or websocket keeps it busy — the font/frame wait still applies */
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}
