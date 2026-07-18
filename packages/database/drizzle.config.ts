import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * PRODUCTION GUARD.
 *
 * `dotenv.config()` above falls back to packages/database/.env, which holds the
 * PRODUCTION connection string. That means a bare `drizzle-kit push` — run from
 * this directory with no DATABASE_URL in the environment — silently targets prod
 * and offers to drop tables. That has already happened once.
 *
 * drizzle-kit is only ever a LOCAL tool in this repo:
 *   - the local e2e/guides stack is built with `push` (see e2e/scripts/setup.sh)
 *   - production changes go through the idempotent apply-*.ts scripts, never push
 *     (the db:migrate runner is unusable — see the notes in scripts/)
 *
 * So a non-local host here is always a mistake, and we fail closed. The escape
 * hatch is deliberately long and unguessable: you cannot reach prod by reflex.
 */
const OVERRIDE = "I_KNOW_THIS_IS_PRODUCTION";
const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL).hostname;
  } catch {
    return "";
  }
})();
const isLocal = host === "127.0.0.1" || host === "localhost" || host === "::1";

if (!isLocal && process.env.ALLOW_REMOTE_DB !== OVERRIDE) {
  throw new Error(
    [
      "",
      "  drizzle-kit is pointed at a NON-LOCAL database and has been blocked.",
      "",
      `    host: ${host || "<unparseable DATABASE_URL>"}`,
      "",
      "  This is almost certainly an accident: with no DATABASE_URL set, this",
      "  config falls back to packages/database/.env, which is PRODUCTION.",
      "  `drizzle-kit push` against prod will offer to DROP TABLES.",
      "",
      "  To rebuild the LOCAL stack instead:",
      "    DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \\",
      "      pnpm exec drizzle-kit push:pg",
      "  (or just run `pnpm e2e:setup`, which pins it for you)",
      "",
      "  Production schema changes do NOT go through drizzle-kit. Use the",
      "  idempotent apply-*.ts scripts in packages/database/scripts/.",
      "",
      `  If you genuinely mean it: ALLOW_REMOTE_DB=${OVERRIDE}`,
      "",
    ].join("\n"),
  );
}

export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL,
  },
  tablesFilter: ["!assigned_order_agg"],
} satisfies Config;
