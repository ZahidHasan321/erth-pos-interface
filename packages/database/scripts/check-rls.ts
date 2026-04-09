import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  // Check RLS status and policies for notifications
  const rls = await db.execute(sql`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname = 'notifications';
  `);
  console.log("RLS enabled on notifications:");
  console.table(rls);

  const policies = await db.execute(sql`
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'notifications';
  `);
  console.log("\nRLS policies on notifications:");
  console.table(policies);

  // Also check what role the realtime subscription uses
  const grants = await db.execute(sql`
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_name = 'notifications'
    ORDER BY grantee, privilege_type;
  `);
  console.log("\nGrants on notifications:");
  console.table(grants);

  process.exit(0);
}
main().catch(console.error);
