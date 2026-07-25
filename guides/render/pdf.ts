/**
 * Print the rendered HTML guides to PDF with headless Chromium.
 *
 * Reuses the browser Playwright already installs rather than adding a PDF library.
 * The HTML is the single rendering path — the @media print rules in render/build.ts
 * are what make the PDF read well, so screen and print can never drift apart.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const OUT = new URL("../out/", import.meta.url).pathname;

const pages = fs.readdirSync(OUT).filter((f) => /^guide\..+\.html$/.test(f));
if (pages.length === 0) {
  throw new Error(`No guide HTML in ${OUT}. Run \`pnpm render\` first.`);
}

const browser = await chromium.launch();
try {
  for (const file of pages) {
    const lang = file.replace(/^guide\.|\.html$/g, "");
    const page = await browser.newPage();
    await page.goto(`file://${path.join(OUT, file)}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: path.join(OUT, `guide.${lang}.pdf`),
      format: "A4",
      // LANDSCAPE on purpose. The app is a wide desktop UI; in portrait the
      // 1440px screenshots shrink to ~186mm and the button labels a reader is
      // meant to find become unreadable. Landscape gives ~273mm, and legible
      // screenshots are the entire point of the document.
      landscape: true,
      printBackground: true,
      margin: { top: "12mm", bottom: "14mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        `<div style="width:100%;font:9px sans-serif;color:#71717a;padding:0 12mm;` +
        `display:flex;justify-content:space-between">` +
        `<span>${lang.toUpperCase()}</span>` +
        `<span class="pageNumber"></span></div>`,
    });
    await page.close();
    const kb = Math.round(fs.statSync(path.join(OUT, `guide.${lang}.pdf`)).size / 1024);
    console.log(`wrote out/guide.${lang}.pdf (${kb} KB)`);
  }
} finally {
  await browser.close();
}
