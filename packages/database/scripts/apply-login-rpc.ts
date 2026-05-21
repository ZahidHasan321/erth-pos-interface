import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0014: the login_with_pin RPC that replaces the auth-login
 * Edge Function. Idempotent (CREATE OR REPLACE, no data mutation) — safe to
 * re-run. Nothing calls the function until the client is switched, so applying
 * this does not affect in-flight logins.
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0014_login_with_pin_rpc.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: public.login_with_pin(text, text) applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
