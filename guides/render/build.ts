/**
 * Render the captured flow into one self-contained HTML page per language.
 *
 * Reads the capture manifests (what was shot, in what order) and joins them
 * against locales/<lang>.json (what the words are). The two are deliberately
 * separate: the manifest carries no prose and the locale carries no geometry, so
 * a new language is a JSON file and never a re-capture.
 *
 * Output is print-friendly, so "save as PDF" from the browser gives you the
 * handout without a second toolchain.
 */
import fs from "node:fs";
import path from "node:path";
import type { ChapterRecord } from "../lib/shot";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = path.join(ROOT, "out");
const MANIFEST = path.join(OUT, "manifest");
const LOCALES = path.join(ROOT, "locales");

type StepText = { title: string; body: string };
type ChapterText = Record<string, StepText | string | undefined> & {
  $title?: string;
  $intro?: string;
};
type Locale = Record<string, ChapterText> & {
  $meta: { lang: string; dir: string; title: string; subtitle: string; $note?: string };
};

function loadChapters(): ChapterRecord[] {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(`No manifest at ${MANIFEST}. Run \`pnpm capture\` first.`);
  }
  return fs
    .readdirSync(MANIFEST)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(MANIFEST, f), "utf8")) as ChapterRecord)
    .sort((a, b) => a.order - b.order);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function render(chapters: ChapterRecord[], loc: Locale): string {
  const { lang, dir, title, subtitle } = loc.$meta;

  const body = chapters
    .map((ch, ci) => {
      const text = loc[ch.id];
      if (!text) {
        // A missing chapter is a translation gap, not a crash. Say so on the page
        // so an untranslated section is visible rather than silently dropped.
        return `<section class="ch"><h2>${esc(ch.id)}</h2>
          <p class="gap">Not yet translated into ${esc(lang)}.</p></section>`;
      }

      const steps = ch.steps
        .map((s, si) => {
          const key = s.id.split(".").slice(1).join(".");
          const t = text[key] as StepText | undefined;
          const heading = t?.title ?? key;
          const prose = t?.body ?? `<span class="gap">Missing text for <code>${esc(s.id)}</code></span>`;
          return `
      <article class="step">
        <div class="step-text">
          <div class="step-n">${ci + 1}.${si + 1}</div>
          <h3>${esc(heading)}</h3>
          <p>${t?.body ? esc(prose) : prose}</p>
          <div class="route"><span class="app app-${s.app}">${s.app}</span><code>${esc(s.route)}</code></div>
        </div>
        <figure><img src="${esc(s.image)}" alt="${esc(heading)}" loading="lazy"></figure>
      </article>`;
        })
        .join("\n");

      return `
    <section class="ch">
      <header class="ch-head">
        <div class="ch-n">${ci + 1}</div>
        <div>
          <h2>${esc(text.$title ?? ch.id)}</h2>
          ${text.$intro ? `<p class="intro">${esc(text.$intro)}</p>` : ""}
        </div>
      </header>
      ${steps}
    </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="${esc(lang)}" dir="${esc(dir)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root {
    --ink: #18181b; --muted: #52525b; --line: #e4e4e7; --bg: #fff;
    --accent: #e11d48; --soft: #fafafa;
  }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#f4f4f5; --muted:#a1a1aa; --line:#27272a; --bg:#09090b; --soft:#131316; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.65 ui-sans-serif, system-ui, "Noto Sans Devanagari", sans-serif;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 48px 24px 96px; }
  h1 { font-size: 2rem; margin: 0 0 8px; letter-spacing: -.02em; }
  .sub { color: var(--muted); margin: 0 0 12px; font-size: 1.05rem; }
  .note { color: var(--muted); font-size: .9rem; background: var(--soft);
          border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin: 20px 0 0; }
  .ch { margin-top: 64px; }
  .ch-head { display: flex; gap: 16px; align-items: flex-start;
             border-top: 2px solid var(--ink); padding-top: 20px; }
  .ch-n { flex: none; width: 36px; height: 36px; border-radius: 999px; background: var(--ink);
          color: var(--bg); display: grid; place-items: center; font-weight: 700; }
  .ch h2 { margin: 4px 0 0; font-size: 1.4rem; letter-spacing: -.01em; }
  .intro { color: var(--muted); margin: 8px 0 0; max-width: 68ch; }
  .step { margin-top: 40px; }
  .step-text { max-width: 68ch; }
  .step-n { color: var(--accent); font-weight: 700; font-size: .85rem; letter-spacing: .04em; }
  .step h3 { margin: 2px 0 6px; font-size: 1.1rem; }
  .step p { margin: 0 0 10px; }
  .route { display: flex; gap: 8px; align-items: center; font-size: .8rem; color: var(--muted); }
  .app { text-transform: uppercase; letter-spacing: .06em; font-weight: 700; font-size: .7rem;
         padding: 2px 7px; border-radius: 4px; }
  .app-shop { background: #dbeafe; color: #1e40af; }
  .app-workshop { background: #fef3c7; color: #92400e; }
  figure { margin: 14px 0 0; }
  img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 10px; }
  .gap { color: var(--accent); font-style: italic; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }
  @media print {
    .step { break-inside: avoid; }
    .ch-head { break-after: avoid; }
    .ch { break-before: page; }
    /* The title block is a deliberate cover page rather than an accidental gap. */
    .cover { min-height: 60vh; }
    body { font-size: 10.5pt; }
    .wrap { max-width: none; padding: 0; }
    /* Two columns per step in landscape: prose left, screenshot right, so the
       image gets the height it needs instead of being squashed under the text. */
    .step { display: grid; grid-template-columns: 32% 1fr; gap: 18px; align-items: start; }
    figure { margin: 0; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="cover">
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(subtitle)}</p>
  ${loc.$meta.$note ? `<p class="note">${esc(loc.$meta.$note)}</p>` : ""}
  </div>
  ${body}
</div>
</body>
</html>`;
}

// ── main ─────────────────────────────────────────────────────────────────────
const chapters = loadChapters();
const langs = fs
  .readdirSync(LOCALES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

for (const lang of langs) {
  const loc = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8")) as Locale;
  const html = render(chapters, loc);
  fs.writeFileSync(path.join(OUT, `guide.${lang}.html`), html);
  console.log(
    `rendered out/guide.${lang}.html  (${chapters.length} chapters, ` +
      `${chapters.reduce((n, c) => n + c.steps.length, 0)} steps)`,
  );
}
