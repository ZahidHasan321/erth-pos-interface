import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0029: invoice revision = signed-invoice CONTENT changes
 * (SPEC §3). Updates toggle_home_delivery to bump invoice_revision on a real
 * home<->pickup change, and adds bump_invoice_revision (style change at
 * unchanged price). Both bodies are CREATE OR REPLACE — idempotent, no data
 * mutation, no DROP — safe to re-run. Depends on 0028 (already applied live).
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0029_invoice_revision_content_changes.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: 0029 applied (toggle_home_delivery bump + bump_invoice_revision).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
