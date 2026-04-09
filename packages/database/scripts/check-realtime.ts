import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  // Check which tables are in the supabase_realtime publication
  const result = await db.execute(sql`
    SELECT schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    ORDER BY tablename;
  `);

  console.log("Tables in supabase_realtime publication:");
  console.table(result);
  process.exit(0);
}
main().catch(console.error);
