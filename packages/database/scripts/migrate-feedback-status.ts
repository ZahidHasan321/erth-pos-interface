/**
 * Migration: Separate feedback_status from piece_stage
 *
 * 1. Add brova_trialed to piece_stage enum
 * 2. Add feedback_status column to garments
 * 3. Migrate existing data
 *
 * Run: npx tsx scripts/migrate-feedback-status.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  console.log("Starting feedback_status migration...\n");

  // 0. Check current state
  const before = await client`
    SELECT piece_stage, location, count(*)::int as cnt
    FROM garments
    WHERE piece_stage IN ('accepted', 'needs_repair', 'needs_redo')
    GROUP BY piece_stage, location
    ORDER BY piece_stage, location
  `;
  console.log("Current state of garments with feedback-related stages:");
  for (const row of before) {
    console.log(`  ${row.piece_stage} @ ${row.location}: ${row.cnt}`);
  }
  if (before.length === 0) console.log("  (none found)");
  console.log();

  // 1. Add brova_trialed to piece_stage enum
  console.log("1. Adding brova_trialed to piece_stage enum...");
  try {
    await client`ALTER TYPE piece_stage ADD VALUE IF NOT EXISTS 'brova_trialed'`;
    console.log("   Done.");
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      console.log("   Already exists, skipping.");
    } else {
      throw e;
    }
  }

  // 2. Add feedback_status column
  console.log("2. Adding feedback_status column...");
  await client`ALTER TABLE garments ADD COLUMN IF NOT EXISTS feedback_status text`;
  console.log("   Done.");

  // 3. Migrate existing data
  console.log("3. Migrating existing garment data...");

  // 3a. accepted → brova_trialed + feedback_status='accepted'
  const r1 = await client`
    UPDATE garments
    SET feedback_status = 'accepted', piece_stage = 'brova_trialed'
    WHERE piece_stage = 'accepted'
  `;
  console.log(`   accepted → brova_trialed: ${r1.count} rows`);

  // 3b. needs_repair at shop → brova_trialed + feedback_status='needs_repair'
  const r2 = await client`
    UPDATE garments
    SET feedback_status = 'needs_repair', piece_stage = 'brova_trialed'
    WHERE piece_stage = 'needs_repair' AND location = 'shop'
  `;
  console.log(`   needs_repair@shop → brova_trialed: ${r2.count} rows`);

  // 3c. needs_redo at shop → brova_trialed + feedback_status='needs_redo'
  const r3 = await client`
    UPDATE garments
    SET feedback_status = 'needs_redo', piece_stage = 'brova_trialed'
    WHERE piece_stage = 'needs_redo' AND location = 'shop'
  `;
  console.log(`   needs_redo@shop → brova_trialed: ${r3.count} rows`);

  // 3d. needs_repair/needs_redo at workshop → waiting_cut + feedback_status preserved
  const r4 = await client`
    UPDATE garments
    SET feedback_status = piece_stage::text, piece_stage = 'waiting_cut'
    WHERE piece_stage IN ('needs_repair', 'needs_redo') AND location = 'workshop'
  `;
  console.log(`   needs_repair/redo@workshop → waiting_cut: ${r4.count} rows`);

  // 3e. needs_repair/needs_redo in transit → set feedback_status, keep piece_stage for now
  const r5 = await client`
    UPDATE garments
    SET feedback_status = piece_stage::text
    WHERE piece_stage IN ('needs_repair', 'needs_redo') AND location IN ('transit_to_workshop', 'transit_to_shop')
  `;
  console.log(`   needs_repair/redo@transit → feedback_status set: ${r5.count} rows`);

  // 4. Verify
  console.log("\n4. Verification...");
  const afterOld = await client`
    SELECT count(*)::int as cnt FROM garments WHERE piece_stage IN ('accepted', 'needs_repair', 'needs_redo')
  `;
  console.log(`   Remaining old piece_stage rows: ${afterOld[0]?.cnt ?? 0}`);

  const afterNew = await client`
    SELECT piece_stage, feedback_status, location, count(*)::int as cnt
    FROM garments
    WHERE feedback_status IS NOT NULL
    GROUP BY piece_stage, feedback_status, location
    ORDER BY piece_stage, feedback_status, location
  `;
  console.log("   New feedback_status distribution:");
  for (const row of afterNew) {
    console.log(`     ${row.piece_stage} + feedback=${row.feedback_status} @ ${row.location}: ${row.cnt}`);
  }
  if (afterNew.length === 0) console.log("     (none)");

  console.log("\nMigration complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
