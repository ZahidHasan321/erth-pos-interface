import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const tables = [
    'garments', 'orders', 'dispatch_log', 'order_shelf_items',
    'transfer_requests', 'transfer_request_items', 'fabrics',
    'shelf', 'accessories', 'notifications'
  ];

  for (const table of tables) {
    const rls = await db.execute(sql`
      SELECT relrowsecurity FROM pg_class WHERE relname = ${table};
    `);
    const enabled = rls[0]?.relrowsecurity;

    const policies = await db.execute(sql`
      SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = ${table};
    `);

    console.log(`\n${table}: RLS=${enabled}`);
    if (policies.length) console.table(policies);
    else console.log('  No policies');
  }

  process.exit(0);
}
main().catch(console.error);
