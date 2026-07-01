import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
async function main() {
  console.log("BEFORE:", JSON.stringify(await db.execute(sql`
    SELECT garment_id, lines FROM garments WHERE garment_id = '2502-1'`)));
  const r = await db.execute(sql`UPDATE garments SET lines = 2 WHERE garment_id = '2502-1' AND lines IS DISTINCT FROM 2`);
  console.log("rows updated:", (r as any).count ?? (r as any).rowCount);
  console.log("AFTER:", JSON.stringify(await db.execute(sql`
    SELECT garment_id, lines FROM garments WHERE garment_id = '2502-1'`)));
  process.exit(0);
}
main().catch((e)=>{console.error(e);process.exit(1);});
