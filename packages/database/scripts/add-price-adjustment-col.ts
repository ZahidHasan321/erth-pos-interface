import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

// Applies migration 0020. Idempotent (IF NOT EXISTS), nullable, no backfill.
async function main() {
  await db.execute(sql`
    ALTER TABLE garment_feedback
    ADD COLUMN IF NOT EXISTS price_adjustment JSONB;
  `);
  console.log("Added garment_feedback.price_adjustment");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
