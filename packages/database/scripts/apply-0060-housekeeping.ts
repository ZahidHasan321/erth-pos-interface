import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply 0060: housekeeping. Runs the `housekeeping` block of src/triggers.sql
 * (single source of truth): AFTER INSERT statement triggers that delete
 * notifications expired for over a day and undo tokens expired for over a day.
 * No reader can show or use those rows. Also re-creates get_delivery_orders,
 * which now only aggregates garments of orders in the requested phase (same
 * output). The first insert after deploy does the one-off catch-up delete.
 * Idempotent, safe to re-run.
 */
function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in triggers.sql`);
  const bodyOpen = src.indexOf("$$", start);
  const bodyClose = src.indexOf("$$", bodyOpen + 2);
  const end = src.indexOf(";", bodyClose) + 1;
  if (bodyOpen === -1 || bodyClose === -1 || end === 0) throw new Error(`could not delimit function ${name}`);
  return src.slice(start, end);
}

async function main() {
  const src = fs.readFileSync(path.join(__dirname, "../src/triggers.sql"), "utf-8");
  const start = src.indexOf("-- BEGIN housekeeping");
  const end = src.indexOf("-- END housekeeping");
  if (start === -1 || end === -1) {
    console.error("ABORT: housekeeping block markers not found in src/triggers.sql");
    process.exit(1);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(src.slice(start, end)));
    await tx.execute(sql.raw(extractFunction(src, "get_delivery_orders")));
  });

  const triggers = (await db.execute(sql`
    SELECT tgname FROM pg_trigger
    WHERE tgname IN ('notifications_purge_expired', 'undo_tokens_purge_expired')
  `)) as unknown as Array<{ tgname: string }>;
  if (triggers.length !== 2) {
    console.error(`ABORT: expected 2 housekeeping triggers, found ${triggers.length}`);
    process.exit(1);
  }

  console.log("OK: 0060 applied. Expired notifications / undo tokens are now cleaned up on insert.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
