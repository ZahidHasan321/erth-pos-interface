import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The workflow suite needs Docker + its own global setup — run it via
    // `pnpm test:workflow` (vitest.workflow.config.ts), not the unit run.
    exclude: ["src/__tests__/workflow.test.ts", "node_modules/**"],
  },
});
