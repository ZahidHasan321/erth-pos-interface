import { defineConfig, devices } from "@playwright/test";
import {
  POS_BASE_URL,
  WORKSHOP_BASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from "../e2e/config";

// Repo root (guides/ is a direct child).
const ROOT = new URL("..", import.meta.url).pathname;

const VITE_ENV = {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
};

export default defineConfig({
  testDir: "./flow",
  testMatch: /.*\.flow\.ts/,

  // The guide follows ONE garment through ONE journey. Chapters hand off state to
  // each other in order, so this can never be parallel — that is the whole point
  // of the "read it front to back" framing.
  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [["list"]],
  globalSetup: "../e2e/global-setup.ts",

  use: {
    ...devices["Desktop Chrome"],

    // Deterministic capture. Without these three the guide produces a different
    // PNG on every run and the diff is unreviewable:
    //   viewport   — a fixed frame so callout coordinates mean the same thing
    //   reducedMotion — framer-motion (a pos-interface dep) settles instantly
    //   timezone   — dates render in the shop's actual timezone (Asia/Kuwait)
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina-sharp text when the guide is printed
    contextOptions: { reducedMotion: "reduce" },
    timezoneId: "Asia/Kuwait",
    locale: "en-US",

    trace: "retain-on-failure",
  },

  projects: [{ name: "capture" }],

  webServer: [
    {
      command: "pnpm --filter pos-interface dev",
      cwd: ROOT,
      url: POS_BASE_URL,
      env: VITE_ENV,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter workshop dev",
      cwd: ROOT,
      url: WORKSHOP_BASE_URL,
      env: VITE_ENV,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
