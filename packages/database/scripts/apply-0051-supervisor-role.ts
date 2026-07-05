import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Apply migration 0051: supervisor role.
 *
 * `ALTER TYPE ... ADD VALUE` must be committed before the new value can be used,
 * so we run each statement as its own (autocommitted) query rather than one
 * batch. Idempotent, safe to re-run.
 */
const client = postgres(process.env.DATABASE_URL!);

async function main() {
  // 1. Add the enum value (committed on its own).
  await client`ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'supervisor'`;
  console.log("OK: enum value 'supervisor' present.");

  // 2. Supervisor counts as manager-or-above for server-side gates.
  await client.unsafe(`
    CREATE OR REPLACE FUNCTION is_manager_or_above()
    RETURNS BOOLEAN AS $$
      SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('super_admin', 'admin', 'manager', 'supervisor'));
    $$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;
  `);
  console.log("OK: is_manager_or_above() includes supervisor.");

  // 3. Promote the existing SHAH user.
  const updated = await client`UPDATE users SET role = 'supervisor' WHERE username = 'shah' RETURNING username, role`;
  console.log(`OK: shah ->`, updated[0] ?? "(no shah user found)");

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
