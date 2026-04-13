import "dotenv/config";
import { db } from "../src/client";
import { garments } from "../src/schema";
import { isNotNull, sql } from "drizzle-orm";
import type { StageTimings } from "../src/schema";

/**
 * Backfill stage_timings for in-flight garments.
 *
 * For each garment that currently has start_time set AND is at a production
 * piece_stage, seed an open session so the UI's elapsed timer has a basis to
 * count from. Historical completions are NOT reconstructed (we don't have the
 * per-stage start/end timestamps for them) — those stay null. Forward-going
 * work fills in naturally as RPCs append sessions.
 *
 * Safe to re-run: only writes when stage_timings is currently empty/null.
 */
async function main() {
  console.log("Backfilling stage_timings for in-flight garments…");

  const rows = await db
    .select({
      id: garments.id,
      piece_stage: garments.piece_stage,
      start_time: garments.start_time,
      stage_timings: garments.stage_timings,
    })
    .from(garments)
    .where(isNotNull(garments.start_time));

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.piece_stage || !row.start_time) {
      skipped++;
      continue;
    }

    const existing = (row.stage_timings ?? {}) as StageTimings;
    if (existing && existing[row.piece_stage] && existing[row.piece_stage]!.length > 0) {
      skipped++;
      continue;
    }

    const startedAt = row.start_time instanceof Date
      ? row.start_time.toISOString()
      : String(row.start_time);

    const next: StageTimings = {
      ...existing,
      [row.piece_stage]: [{ worker: null, started_at: startedAt, completed_at: null }],
    };

    await db.execute(
      sql`UPDATE garments SET stage_timings = ${JSON.stringify(next)}::jsonb WHERE id = ${row.id}`,
    );
    updated++;
  }

  console.log(`Done — updated: ${updated}, skipped: ${skipped} (already seeded or no data).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
