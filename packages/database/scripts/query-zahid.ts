import "dotenv/config";
import { db } from "../src/client";
import { dispatchLog } from "../src/schema";
import { sql } from "drizzle-orm";

async function main() {
  const rows = await db.execute(sql`SELECT * FROM dispatch_log WHERE order_id = 9 ORDER BY dispatched_at`);
  console.log(`Order 9 dispatch log (${rows.length}):`);
  for (const r of rows as any) {
    console.log(`  ${r.dispatched_at} | g=${r.garment_id?.slice(0,8)} | trip=${r.trip_number} | dir=${r.direction}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
