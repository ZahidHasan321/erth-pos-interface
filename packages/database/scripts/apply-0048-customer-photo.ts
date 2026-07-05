import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0048: customers.photo_url (customer photo in the demographics
 * form). Single idempotent ADD COLUMN IF NOT EXISTS, safe to re-run.
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0048_customer_photo.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: 0048 applied (customers.photo_url).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
