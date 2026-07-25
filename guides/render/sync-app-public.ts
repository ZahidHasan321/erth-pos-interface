/**
 * Copy the app-facing guide content (build-app-content.ts's output, plus the
 * raw screenshots) into both apps' public/guides/. guides/out/ is gitignored
 * build output; these two destinations are committed normally, because
 * Vercel builds each app in isolation and can't run Playwright capture at
 * build time — the rendered content has to already be in the app's repo.
 *
 * Each destination is wiped before copying so a renamed/removed chapter or
 * step never leaves an orphaned file behind, same reasoning as shot.ts
 * wiping a chapter's screenshot dir before recapturing it.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = path.join(ROOT, "out");

const TARGETS = [
  path.join(ROOT, "..", "apps", "pos-interface", "public", "guides"),
  path.join(ROOT, "..", "apps", "workshop", "public", "guides"),
];

function main(): void {
  const appContent = path.join(OUT, "app-content");
  const shots = path.join(OUT, "shots");

  if (!fs.existsSync(appContent) || !fs.existsSync(shots)) {
    throw new Error(
      "Missing guides/out/app-content or guides/out/shots. Run `pnpm render:app` (and `pnpm capture` if shots are missing) first.",
    );
  }

  for (const target of TARGETS) {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(appContent, path.join(target, "app-content"), { recursive: true });
    fs.cpSync(shots, path.join(target, "shots"), { recursive: true });
    console.log(`synced guide content -> ${path.relative(path.join(ROOT, ".."), target)}`);
  }
}

main();
