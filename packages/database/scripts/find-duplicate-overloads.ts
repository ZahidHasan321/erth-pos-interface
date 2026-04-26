/**
 * Lists public.* functions with multiple overloads — candidates for the
 * PostgREST "could not choose the best candidate function" error.
 *
 * Usage: pnpm --filter @repo/database tsx scripts/find-duplicate-overloads.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const rows = await sql<
    { name: string; overloads: number; signatures: string[] }[]
  >`
    SELECT p.proname AS name,
           count(*)::int AS overloads,
           array_agg(pg_get_function_identity_arguments(p.oid) ORDER BY p.oid) AS signatures
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    GROUP BY p.proname
    HAVING count(*) > 1
    ORDER BY count(*) DESC, p.proname
  `;

  if (rows.length === 0) {
    console.log("No duplicate overloads in public schema.");
  } else {
    console.log(`Found ${rows.length} function(s) with multiple overloads:\n`);
    for (const r of rows) {
      console.log(`${r.name}  (${r.overloads} overloads)`);
      r.signatures.forEach((sig, i) => console.log(`  [${i}] (${sig})`));
      console.log();
    }
    console.log("Drop the stale ones with:");
    console.log("  DROP FUNCTION public.<name>(<exact signature>);");
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
