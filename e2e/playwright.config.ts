import { defineConfig, devices } from "@playwright/test";
import {
  POS_BASE_URL,
  WORKSHOP_BASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from "./config";

// Repo root (e2e/ is a direct child).
const ROOT = new URL("..", import.meta.url).pathname;

// Both apps read VITE_SUPABASE_* from .env.local (which we write to point at the
// local stack). We also pass them through here so the harness is self-contained
// even if an app's .env.local is absent.
const VITE_ENV = {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],

  globalSetup: "./global-setup.ts",

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Boot BOTH Vite dev servers. reuseExistingServer keeps already-running dev
  // servers (the common local case); CI starts fresh. Vite has strictPort, so
  // a port clash fails loudly rather than silently shifting ports.
  webServer: [
    {
      command: "pnpm --filter pos-interface dev",
      cwd: ROOT,
      url: POS_BASE_URL,
      env: VITE_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter workshop dev",
      cwd: ROOT,
      url: WORKSHOP_BASE_URL,
      env: VITE_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
