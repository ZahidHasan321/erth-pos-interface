import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply 0061: re-create orders_with_garments_at from src/triggers.sql (single
 * source of truth) as plpgsql. The LANGUAGE sql version was inlined into
 * PostgREST's LATERAL call, re-scanning garments once per orders row (~7.5s,
 * statement timeouts on the shop Receiving list). Same signature and output.
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
  await db.execute(sql.raw(extractFunction(src, "orders_with_garments_at")));

  const rows = (await db.execute(sql`
    SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.proname = 'orders_with_garments_at'
  `)) as unknown as Array<{ lanname: string }>;
  if (rows.length !== 1 || rows[0].lanname !== "plpgsql") {
    console.error(`ABORT: expected one plpgsql orders_with_garments_at, found ${JSON.stringify(rows)}`);
    process.exit(1);
  }
  console.log("OK: 0061 applied. orders_with_garments_at is plpgsql (no per-row garment scan).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
