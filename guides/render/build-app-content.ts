/**
 * Export the captured flow for the in-app Guides viewer (apps/pos-interface,
 * apps/workshop), as opposed to build.ts's single static HTML/PDF handout.
 *
 * Same two inputs as build.ts (out/manifest + locales/<lang>.json), but split
 * into three small JSON shapes so an app can load a search index eagerly and
 * a chapter's full text lazily, without ever bundling every chapter's prose
 * (or any image) up front:
 *
 *   out/app-content/toc.<lang>.json                 chapter list, eager
 *   out/app-content/search-index.<lang>.json         step-level search, eager
 *   out/app-content/chapters/<lang>/<chapterId>.json  one chapter's full text, lazy
 *
 * Deliberately self-contained rather than sharing loadChapters()/the join
 * logic with build.ts — that logic is small, and duplicating it means this
 * script can never change the static renderer's output.
 *
 * Unlike build.ts (which prints a literal "Not yet translated"/"Missing
 * text" gap for the reader), a missing chapter or step in a non-English
 * locale here falls back to the English text: an in-app doc should always
 * read as complete, not show holes while a translation catches up.
 */
import fs from "node:fs";
import path from "node:path";
import type { ChapterRecord } from "../lib/shot";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = path.join(ROOT, "out");
const MANIFEST = path.join(OUT, "manifest");
const LOCALES = path.join(ROOT, "locales");
const APP_CONTENT = path.join(OUT, "app-content");
const FALLBACK_LANG = "en";

type StepText = { title: string; body: string };
type ChapterText = Record<string, StepText | string | undefined> & {
  $title?: string;
  $intro?: string;
};
type Locale = Record<string, ChapterText> & {
  $meta: { lang: string; dir: string; title: string; subtitle: string };
};

export type SearchEntry = {
  chapterId: string;
  chapterTitle: string;
  stepId: string;
  stepKey: string;
  title: string;
  snippet: string;
  app: "shop" | "workshop";
};

export type ChapterDetailStep = {
  id: string;
  key: string;
  title: string;
  body: string;
  image: string;
  marks: number;
  app: "shop" | "workshop";
  route: string;
};

export type ChapterDetail = {
  id: string;
  order: number;
  app: "shop" | "workshop";
  title: string;
  intro: string;
  steps: ChapterDetailStep[];
};

export type TocEntry = {
  id: string;
  order: number;
  app: "shop" | "workshop";
  title: string;
  intro: string;
  stepCount: number;
};

export type Toc = {
  meta: { lang: string; dir: string; title: string; subtitle: string };
  chapters: TocEntry[];
};

export function loadChapters(manifestDir: string): ChapterRecord[] {
  if (!fs.existsSync(manifestDir)) {
    throw new Error(`No manifest at ${manifestDir}. Run \`pnpm capture\` first.`);
  }
  return fs
    .readdirSync(manifestDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(manifestDir, f), "utf8")) as ChapterRecord)
    .sort((a, b) => a.order - b.order);
}

export function loadLocales(localesDir: string): Record<string, Locale> {
  const langs = fs
    .readdirSync(localesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  const out: Record<string, Locale> = {};
  for (const lang of langs) {
    out[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, `${lang}.json`), "utf8")) as Locale;
  }
  return out;
}

function pickChapterText(
  locales: Record<string, Locale>,
  lang: string,
  chapterId: string,
): ChapterText | undefined {
  return locales[lang]?.[chapterId] ?? locales[FALLBACK_LANG]?.[chapterId];
}

function pickStepText(
  locales: Record<string, Locale>,
  lang: string,
  chapterId: string,
  key: string,
): StepText | undefined {
  const inLang = locales[lang]?.[chapterId]?.[key];
  if (inLang && typeof inLang === "object") return inLang;
  const fallback = locales[FALLBACK_LANG]?.[chapterId]?.[key];
  if (fallback && typeof fallback === "object") return fallback;
  return undefined;
}

function snippet(body: string, max = 140): string {
  const plain = body.replace(/\[\[ref:[a-z0-9.-]+\]\]/gi, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

export function buildForLang(
  lang: string,
  chapters: ChapterRecord[],
  locales: Record<string, Locale>,
): { toc: Toc; searchIndex: SearchEntry[]; chapterDetails: ChapterDetail[] } {
  const meta = locales[lang]?.$meta ?? locales[FALLBACK_LANG].$meta;
  const tocChapters: TocEntry[] = [];
  const searchIndex: SearchEntry[] = [];
  const chapterDetails: ChapterDetail[] = [];

  for (const ch of chapters) {
    const text = pickChapterText(locales, lang, ch.id);
    const title = text?.$title ?? ch.id;
    const intro = text?.$intro ?? "";

    const steps: ChapterDetailStep[] = ch.steps.map((s) => {
      const key = s.id.split(".").slice(1).join(".");
      const stepText = pickStepText(locales, lang, ch.id, key);
      const stepTitle = stepText?.title ?? key;
      const body = stepText?.body ?? "";

      searchIndex.push({
        chapterId: ch.id,
        chapterTitle: title,
        stepId: s.id,
        stepKey: key,
        title: stepTitle,
        snippet: snippet(body),
        app: s.app,
      });

      return {
        id: s.id,
        key,
        title: stepTitle,
        body,
        image: s.image,
        marks: s.marks,
        app: s.app,
        route: s.route,
      };
    });

    tocChapters.push({ id: ch.id, order: ch.order, app: ch.app, title, intro, stepCount: steps.length });
    chapterDetails.push({ id: ch.id, order: ch.order, app: ch.app, title, intro, steps });
  }

  return { toc: { meta, chapters: tocChapters }, searchIndex, chapterDetails };
}

function main(): void {
  const chapters = loadChapters(MANIFEST);
  const locales = loadLocales(LOCALES);
  if (!locales[FALLBACK_LANG]) {
    throw new Error(`No locales/${FALLBACK_LANG}.json — it is the required fallback locale.`);
  }

  fs.mkdirSync(APP_CONTENT, { recursive: true });

  for (const lang of Object.keys(locales)) {
    const { toc, searchIndex, chapterDetails } = buildForLang(lang, chapters, locales);

    fs.writeFileSync(path.join(APP_CONTENT, `toc.${lang}.json`), JSON.stringify(toc));
    fs.writeFileSync(path.join(APP_CONTENT, `search-index.${lang}.json`), JSON.stringify(searchIndex));

    const chapterDir = path.join(APP_CONTENT, "chapters", lang);
    fs.rmSync(chapterDir, { recursive: true, force: true });
    fs.mkdirSync(chapterDir, { recursive: true });
    for (const detail of chapterDetails) {
      fs.writeFileSync(path.join(chapterDir, `${detail.id}.json`), JSON.stringify(detail));
    }

    console.log(
      `app-content[${lang}]: ${toc.chapters.length} chapters, ${searchIndex.length} steps indexed`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
