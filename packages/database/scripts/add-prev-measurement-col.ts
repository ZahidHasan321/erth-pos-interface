import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE garment_feedback
    ADD COLUMN IF NOT EXISTS previous_measurement_id uuid
    REFERENCES measurements(id);
  `);
  console.log("Added garment_feedback.previous_measurement_id");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
