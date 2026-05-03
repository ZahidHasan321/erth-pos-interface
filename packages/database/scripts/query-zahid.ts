import "dotenv/config";
import { db } from "../src/client";
import { garments } from "../src/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  const stale = await db
    .select({
      id: garments.id,
      garment_id: garments.garment_id,
      order_id: garments.order_id,
      soaking_completed_at: garments.soaking_completed_at,
    })
    .from(garments)
    .where(sql`piece_stage = 'soaking'`);

  console.log(`Found ${stale.length} garment(s) with stale piece_stage='soaking':`);
  for (const g of stale) {
    console.log(`  - ${g.garment_id} (order ${g.order_id}) soak_done=${g.soaking_completed_at?.toISOString() ?? "NO"}`);
  }

  if (stale.length === 0) {
    process.exit(0);
  }

  for (const g of stale) {
    await db
      .update(garments)
      .set({ piece_stage: "cutting" as any })
      .where(eq(garments.id, g.id));
    console.log(`Updated ${g.garment_id} → piece_stage=cutting`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
