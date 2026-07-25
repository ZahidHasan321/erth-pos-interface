import { chromium } from '@playwright/test';
const b = await chromium.launch();
for (const lang of ['en','hi']) {
  const p = await b.newPage({ viewport:{width:1100,height:1400}, deviceScaleFactor:1 });
  await p.goto(`file:///mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/mono-repo/guides/out/guide.${lang}.html`);
  await p.waitForTimeout(800);
  await p.screenshot({ path:`/tmp/claude-1000/-mnt-339cc06e-972e-45cf-aed0-2b21bc4f4d69-dev-autolinium-erth-mono-repo/a23c9e26-22cb-48c1-b41f-06217a158a8c/scratchpad/guide-${lang}.png` });
  await p.close();
}
await b.close();
