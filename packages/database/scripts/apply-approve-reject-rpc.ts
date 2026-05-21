import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0018: approve_transfer / reject_transfer RPCs (status-guarded,
 * idempotent). Idempotent (CREATE OR REPLACE, no data mutation) — safe to
 * re-run. Nothing calls these until the client is switched, so applying does
 * not affect in-flight transfers.
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0018_approve_reject_transfer_rpc.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: approve_transfer / reject_transfer applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
