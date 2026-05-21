import { defineConfig } from "vitest/config";

// End-to-end garment-lifecycle suite. Runs the real RPCs + triggers against an
// ephemeral Dockerized Postgres (see scripts/workflow-test/global-setup.ts).
// Separate from the default unit config because it needs Docker + a long-lived
// global setup, and must run serially (single shared DB connection).
export default defineConfig({
  test: {
    include: ["src/__tests__/workflow*.test.ts"],
    globalSetup: ["scripts/lifecycle/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
