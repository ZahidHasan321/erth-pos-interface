import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0056: get_stage_history_garments, the server-side day filter
 * behind the workshop terminal history page. Read-only function, no schema or
 * data change. Idempotent, safe to re-run.
 */
async function main() {
  const file = path.join(__dirname, "../src/migrations/0056_stage_history_rpc.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));

  const fn = (await db.execute(sql`
    SELECT p.prosecdef, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_stage_history_garments'
  `)) as unknown as Array<{ prosecdef: boolean; args: string }>;

  if (fn.length !== 1) {
    console.error(`ABORT: expected 1 get_stage_history_garments, found ${fn.length}`);
    process.exit(1);
  }
  // SECURITY INVOKER is the point: garment RLS must still apply to the caller.
  if (fn[0].prosecdef) {
    console.error("ABORT: function is SECURITY DEFINER; it must be INVOKER so RLS applies.");
    process.exit(1);
  }

  console.log("OK: 0056 applied.");
  console.log(`  get_stage_history_garments(${fn[0].args}) SECURITY INVOKER`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
