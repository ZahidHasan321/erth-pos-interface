import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChapterRecord } from "../lib/shot";
import { loadChapters, loadLocales, buildForLang } from "./build-app-content";

function fixtureChapter(overrides: Partial<ChapterRecord> = {}): ChapterRecord {
  return {
    id: "01-take-order",
    order: 1,
    app: "shop",
    steps: [
      { id: "01-take-order.open-from-sidebar", image: "shots/01-take-order/01-open-from-sidebar.png", marks: 1, app: "shop", route: "/orders/new-work-order" },
      { id: "01-take-order.enter-name", image: "shots/01-take-order/02-enter-name.png", marks: 1, app: "shop", route: "/orders/new-work-order" },
    ],
    ...overrides,
  };
}

const enLocale = {
  $meta: { lang: "en", dir: "ltr", title: "Order Processing Manual", subtitle: "sub" },
  "01-take-order": {
    $title: "Creating a work order",
    $intro: "Intro text.",
    "open-from-sidebar": { title: "Open the form", body: "Select New Work Order (1). It opens." },
    "enter-name": { title: "Enter the name", body: "Enter the customer's full name (1)." },
  },
};

describe("loadChapters", () => {
  let dir: string;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("sorts chapters by order regardless of file read order", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "guides-manifest-"));
    fs.writeFileSync(path.join(dir, "z-second.json"), JSON.stringify(fixtureChapter({ id: "second", order: 2 })));
    fs.writeFileSync(path.join(dir, "a-first.json"), JSON.stringify(fixtureChapter({ id: "first", order: 1 })));

    const chapters = loadChapters(dir);

    expect(chapters.map((c) => c.id)).toEqual(["first", "second"]);
  });

  it("throws a descriptive error when the manifest directory is missing", () => {
    expect(() => loadChapters(path.join(os.tmpdir(), "does-not-exist-" + Date.now()))).toThrow(/Run `pnpm capture`/);
  });
});

describe("loadLocales", () => {
  let dir: string;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keys locales by filename-derived language", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "guides-locales-"));
    fs.writeFileSync(path.join(dir, "en.json"), JSON.stringify(enLocale));
    fs.writeFileSync(path.join(dir, "hi.json"), JSON.stringify({ $meta: { lang: "hi", dir: "ltr", title: "t", subtitle: "s" } }));

    const locales = loadLocales(dir);

    expect(Object.keys(locales).sort()).toEqual(["en", "hi"]);
    expect(locales.en.$meta.lang).toBe("en");
  });
});

describe("buildForLang", () => {
  it("joins manifest + locale for a fully-translated language", () => {
    const chapters = [fixtureChapter()];
    const result = buildForLang("en", chapters, { en: enLocale });

    expect(result.toc.chapters).toEqual([
      { id: "01-take-order", order: 1, app: "shop", title: "Creating a work order", intro: "Intro text.", stepCount: 2 },
    ]);
    expect(result.searchIndex).toHaveLength(2);
    expect(result.searchIndex[0]).toMatchObject({
      chapterId: "01-take-order",
      chapterTitle: "Creating a work order",
      stepId: "01-take-order.open-from-sidebar",
      stepKey: "open-from-sidebar",
      title: "Open the form",
    });
    expect(result.chapterDetails[0].steps[0]).toMatchObject({
      id: "01-take-order.open-from-sidebar",
      key: "open-from-sidebar",
      title: "Open the form",
      body: "Select New Work Order (1). It opens.",
      image: "shots/01-take-order/01-open-from-sidebar.png",
    });
  });

  it("falls back to English when a chapter is entirely untranslated", () => {
    const chapters = [fixtureChapter()];
    const hiLocale = { $meta: { lang: "hi", dir: "ltr", title: "t", subtitle: "s" } };

    const result = buildForLang("hi", chapters, { en: enLocale, hi: hiLocale });

    expect(result.toc.chapters[0].title).toBe("Creating a work order");
    expect(result.chapterDetails[0].steps[0].body).toBe("Select New Work Order (1). It opens.");
  });

  it("falls back to English per-step when only some steps are translated", () => {
    const chapters = [fixtureChapter()];
    const hiLocale = {
      $meta: { lang: "hi", dir: "ltr", title: "t", subtitle: "s" },
      "01-take-order": {
        $title: "कार्य आदेश बनाएं",
        $intro: "परिचय",
        "open-from-sidebar": { title: "फॉर्म खोलें", body: "साइडबार में चुनें" },
        // enter-name intentionally omitted
      },
    };

    const result = buildForLang("hi", chapters, { en: enLocale, hi: hiLocale });

    expect(result.chapterDetails[0].title).not.toBe("Creating a work order");
    expect(result.chapterDetails[0].steps[0].title).toBe("फॉर्म खोलें");
    expect(result.chapterDetails[0].steps[1].title).toBe("Enter the name");
    expect(result.chapterDetails[0].steps[1].body).toBe("Enter the customer's full name (1).");
  });

  it("uses the step key as title and an empty body when text is missing in every locale", () => {
    const chapters = [fixtureChapter({ steps: [{ id: "01-take-order.orphan-step", image: "x.png", marks: 0, app: "shop", route: "/x" }] })];
    const bareLocale = { $meta: enLocale.$meta, "01-take-order": { $title: "Creating a work order" } };

    const result = buildForLang("en", chapters, { en: bareLocale });

    expect(result.chapterDetails[0].steps[0]).toMatchObject({ title: "orphan-step", body: "" });
  });

  it("strips ref markers and truncates long bodies in the search snippet", () => {
    const longBody =
      "A".repeat(150) + " see [[ref:01-take-order.enter-mobile]] for details.";
    const chapters = [fixtureChapter({ steps: [{ id: "01-take-order.long", image: "x.png", marks: 0, app: "shop", route: "/x" }] })];
    const locale = {
      $meta: enLocale.$meta,
      "01-take-order": { $title: "t", "long": { title: "Long step", body: longBody } },
    };

    const result = buildForLang("en", chapters, { en: locale });

    expect(result.searchIndex[0].snippet).not.toContain("[[ref:");
    expect(result.searchIndex[0].snippet.length).toBeLessThanOrEqual(140);
    expect(result.searchIndex[0].snippet.endsWith("…")).toBe(true);
  });
});
