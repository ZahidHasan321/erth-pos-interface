import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Apply 0058: read paths that stay fast as history grows. Same results as
 * before; every statement is taken verbatim from src/triggers.sql (single
 * source of truth):
 *   - my_brands() / can_access_all_brands()        (already live via 0057; re-created, idempotent)
 *   - notification RPCs: caller lookups once per call, not once per row
 *   - get_assigned_overview / get_assigned_orders_page: aggregate only
 *     in-progress orders' garments, not the whole garments history
 *   - get_dashboard_orders: the shop dashboard's source rows (was every
 *     confirmed order, cut at PostgREST max_rows)
 *   - get_scheduled_day_counts: scheduler calendar counts
 *   - get_showroom_orders_page / get_delivery_orders: skip the brand's
 *     finished history
 *   - orders_with_garments_at / orders_with_undispatched_garments /
 *     garments_with_workshop_feedback: candidate rows for the shop dispatch
 *     lists (the app keeps its exact select + filters on top)
 *   - indexes: garments(assigned_date), notifications(expires_at)
 * Requires 0059 first (get_delivery_orders reads garments.brand); run in the
 * wrong order it fails and rolls back. Idempotent, safe to re-run. One
 * transaction: all or nothing.
 */
const FUNCTIONS = [
  "my_brands",
  "can_access_all_brands",
  "get_my_notifications",
  "get_my_notifications_count",
  "get_unread_notification_count",
  "mark_all_notifications_read",
  "get_assigned_overview",
  "get_assigned_orders_page",
  "get_dashboard_orders",
  "get_scheduled_day_counts",
  "get_showroom_orders_page",
  "get_delivery_orders",
  "orders_with_garments_at",
  "orders_with_undispatched_garments",
  "garments_with_workshop_feedback",
];
const INDEXES = ["garments_assigned_date_idx", "notifications_expires_at_idx"];

function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in triggers.sql`);
  const bodyOpen = src.indexOf("$$", start);
  const bodyClose = src.indexOf("$$", bodyOpen + 2);
  const end = src.indexOf(";", bodyClose) + 1;
  if (bodyOpen === -1 || bodyClose === -1 || end === 0) throw new Error(`could not delimit function ${name}`);
  return src.slice(start, end);
}

function extractIndex(src: string, name: string): string {
  const start = src.indexOf(`CREATE INDEX IF NOT EXISTS ${name}`);
  if (start === -1) throw new Error(`index ${name} not found in triggers.sql`);
  return src.slice(start, src.indexOf(";", start) + 1);
}

async function main() {
  const src = fs.readFileSync(path.join(__dirname, "../src/triggers.sql"), "utf-8");
  const statements = [...INDEXES.map((n) => extractIndex(src, n)), ...FUNCTIONS.map((n) => extractFunction(src, n))];

  await db.transaction(async (tx) => {
    for (const stmt of statements) await tx.execute(sql.raw(stmt));
  });

  const fns = (await db.execute(sql`
    SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
  `)) as unknown as Array<{ proname: string }>;
  const idx = (await db.execute(sql`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `)) as unknown as Array<{ indexname: string }>;

  const missingFns = FUNCTIONS.filter((f) => !fns.some((r) => r.proname === f));
  const missingIdx = INDEXES.filter((i) => !idx.some((r) => r.indexname === i));
  if (missingFns.length || missingIdx.length) {
    console.error(`ABORT: missing after apply: ${[...missingFns, ...missingIdx].join(", ")}`);
    process.exit(1);
  }
  console.log(`OK: 0058 applied. ${FUNCTIONS.length} functions, ${INDEXES.length} indexes.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
