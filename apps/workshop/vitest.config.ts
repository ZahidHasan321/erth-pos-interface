import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
