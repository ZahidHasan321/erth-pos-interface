import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  // Check replication slots
  const slots = await db.execute(sql`
    SELECT slot_name, plugin, slot_type, active, restart_lsn, confirmed_flush_lsn
    FROM pg_replication_slots;
  `);
  console.log("Replication slots:");
  console.table(slots);

  // Check publication
  const pubs = await db.execute(sql`
    SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete
    FROM pg_publication
    WHERE pubname = 'supabase_realtime';
  `);
  console.log("\nPublication config:");
  console.table(pubs);

  // Check WAL level
  const wal = await db.execute(sql`SHOW wal_level;`);
  console.log("\nWAL level:", wal[0]?.wal_level);

  process.exit(0);
}
main().catch(console.error);
