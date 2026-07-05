import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply migration 0052: admin Team unified roster + performance-garment
 * passthrough. Two CREATE OR REPLACE read-only RPCs (admin_team_roster,
 * admin_performance_garments). Idempotent, safe to re-run.
 */
async function main() {
  const file = path.join(__dirname, "../migrations/0052_admin_team_roster_and_perf.sql");
  await db.execute(sql.raw(fs.readFileSync(file, "utf-8")));
  console.log("OK: 0052 applied (admin_team_roster + admin_performance_garments RPCs).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
