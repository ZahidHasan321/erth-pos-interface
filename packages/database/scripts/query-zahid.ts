import "dotenv/config";
import { db } from "../src/client";
import { garments } from "../src/schema";
import { inArray, sql } from "drizzle-orm";

async function main() {
  // Find all garments, group by (order_id, garment_id), keep earliest inserted (lowest uuid sort), delete rest
  const all = await db
    .select({ id: garments.id, order_id: garments.order_id, garment_id: garments.garment_id })
    .from(garments);

  const groups = new Map<string, typeof all>();
  for (const g of all) {
    const key = `${g.order_id}::${g.garment_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }

  const toDelete: string[] = [];
  for (const [key, rows] of groups) {
    if (rows.length > 1) {
      console.log(`Duplicate (${key}) × ${rows.length} — keeping ${rows[0].id}, deleting ${rows.slice(1).map(r => r.id).join(', ')}`);
      toDelete.push(...rows.slice(1).map(r => r.id));
    }
  }

  if (toDelete.length === 0) {
    console.log("No duplicates found across all garments.");
    process.exit(0);
  }

  console.log(`\nDeleting ${toDelete.length} duplicate garment(s)...`);
  await db.delete(garments).where(inArray(garments.id, toDelete));
  console.log("Done.");
  process.exit(0);
}
main().catch(console.error);
