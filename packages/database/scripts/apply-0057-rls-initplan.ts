import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply 0057: RLS per-statement helper evaluation. Runs the `rls-initplan`
 * block at the end of src/triggers.sql (single source of truth): adds
 * my_brands() / can_access_all_brands() and rewrites every public policy so
 * its helpers run once per statement instead of once per row. Access rules
 * are unchanged. Idempotent, safe to re-run.
 */
const HELPER_CALL =
  /(?<!SELECT )(?<![\w.])(is_super_admin|is_active_user|is_admin|is_manager_or_above|get_my_role|get_my_department|get_my_user_id|get_my_job_functions|auth\.uid|can_access_brand)\(/;

async function main() {
  const src = fs.readFileSync(path.join(__dirname, "../src/triggers.sql"), "utf-8");
  const start = src.indexOf("-- BEGIN rls-initplan");
  const end = src.indexOf("-- END rls-initplan");
  if (start === -1 || end === -1) {
    console.error("ABORT: rls-initplan block markers not found in src/triggers.sql");
    process.exit(1);
  }

  // One transaction: either every policy is rewritten or none is.
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(src.slice(start, end)));
  });

  const policies = (await db.execute(sql`
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
  `)) as unknown as Array<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>;

  const leftover = policies.filter((p) => HELPER_CALL.test(p.qual ?? "") || HELPER_CALL.test(p.with_check ?? ""));
  if (leftover.length) {
    console.error(`ABORT: ${leftover.length} policies still call a helper per row:`);
    for (const p of leftover) console.error(`  ${p.tablename}.${p.policyname}`);
    process.exit(1);
  }

  console.log(`OK: 0057 applied. ${policies.length} public policies, none call a helper per row.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
