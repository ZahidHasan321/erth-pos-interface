/**
 * Playwright globalSetup — a fast readiness gate, NOT the heavy build.
 *
 * The heavy lifting (supabase start, schema push, triggers, seed) is done once
 * by `pnpm --filter e2e setup` (scripts/setup.sh). This just verifies the DB is
 * up, the login RPC exists, and the seeded users are present — failing with a
 * clear "run setup first" message if not, so a missing prerequisite doesn't
 * surface as an opaque login-timeout in the browser.
 */
import postgres from "postgres";
import { DATABASE_URL, USERS } from "./config";

export default async function globalSetup(): Promise<void> {
  const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 2, connect_timeout: 5 });
  try {
    // 1. DB reachable?
    await sql`SELECT 1`;

    // 2. Login RPC present?
    const [{ has_rpc }] = await sql<{ has_rpc: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'login_with_pin'
      ) AS has_rpc
    `;
    if (!has_rpc) {
      throw new Error("login_with_pin RPC missing");
    }

    // 3. Seeded users present?
    const usernames = Object.values(USERS).map((u) => u.username);
    const rows = await sql<{ username: string }[]>`
      SELECT username FROM users WHERE username = ANY(${sql.array(usernames)})
    `;
    const found = new Set(rows.map((r) => r.username));
    const missing = usernames.filter((u) => !found.has(u));
    if (missing.length > 0) {
      throw new Error(`seeded users missing: ${missing.join(", ")}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `E2E prerequisites not ready (${msg}).\n` +
        `Run the one-time setup first:  pnpm --filter e2e setup\n` +
        `(it starts local Supabase, builds the schema, and seeds users)`,
    );
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}
