import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  const action = process.argv[2];

  if (action === "disable-rls") {
    await db.execute(sql`ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;`);
    console.log("RLS DISABLED on notifications");
  } else if (action === "enable-rls") {
    await db.execute(sql`ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;`);
    console.log("RLS RE-ENABLED on notifications");
  } else if (action === "check-replica") {
    const result = await db.execute(sql`
      SELECT relname, relreplident
      FROM pg_class
      WHERE relname IN ('notifications', 'garments', 'orders', 'fabrics', 'shelf')
      ORDER BY relname;
    `);
    // d = default (primary key only), f = full, n = nothing
    console.log("Replica identity (d=default/pk-only, f=full, n=nothing):");
    console.table(result);
  } else {
    console.log("Usage: tsx test-realtime-debug.ts [disable-rls|enable-rls|check-replica]");
  }

  process.exit(0);
}
main().catch(console.error);
