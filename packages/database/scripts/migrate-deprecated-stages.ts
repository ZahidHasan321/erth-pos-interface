/**
 * Migration: Remove deprecated piece_stage values from garments table.
 *
 * Migrates:
 *   at_shop        → awaiting_trial (brova) or ready_for_pickup (final)
 *   accepted       → brova_trialed  + feedback_status='accepted', acceptance_status=true
 *   needs_repair   → brova_trialed  + feedback_status='needs_repair'
 *   needs_redo     → brova_trialed  + feedback_status='needs_redo'
 *
 * After running this, the deprecated enum values can be removed from the DB:
 *   ALTER TYPE piece_stage RENAME VALUE 'at_shop' TO '_deprecated_at_shop';
 *   (PostgreSQL doesn't support DROP VALUE from enum, but renaming prevents usage)
 *
 * Run: npx tsx scripts/migrate-deprecated-stages.ts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const sql = postgres(DATABASE_URL);
const db = drizzle(sql);

async function migrate() {
  console.log("=== Migrating deprecated piece_stage values ===\n");

  // 1. at_shop → awaiting_trial (brova) or ready_for_pickup (final, first trip)
  const atShopBrova = await sql`
    UPDATE garments
    SET piece_stage = 'awaiting_trial'
    WHERE piece_stage = 'at_shop' AND garment_type = 'brova'
    RETURNING id, garment_id
  `;
  console.log(`at_shop (brova) → awaiting_trial: ${atShopBrova.length} rows`);

  const atShopFinal = await sql`
    UPDATE garments
    SET piece_stage = 'ready_for_pickup'
    WHERE piece_stage = 'at_shop' AND garment_type = 'final'
    RETURNING id, garment_id
  `;
  console.log(`at_shop (final) → ready_for_pickup: ${atShopFinal.length} rows`);

  // Catch any remaining at_shop (unknown garment_type)
  const atShopOther = await sql`
    UPDATE garments
    SET piece_stage = 'awaiting_trial'
    WHERE piece_stage = 'at_shop'
    RETURNING id, garment_id
  `;
  console.log(`at_shop (other) → awaiting_trial: ${atShopOther.length} rows`);

  // 2. accepted → brova_trialed + feedback_status='accepted' + acceptance_status=true
  const accepted = await sql`
    UPDATE garments
    SET piece_stage = 'brova_trialed',
        feedback_status = COALESCE(feedback_status, 'accepted'),
        acceptance_status = true
    WHERE piece_stage = 'accepted'
    RETURNING id, garment_id
  `;
  console.log(`accepted → brova_trialed: ${accepted.length} rows`);

  // 3. needs_repair (as piece_stage) → brova_trialed + feedback_status='needs_repair'
  const needsRepair = await sql`
    UPDATE garments
    SET piece_stage = 'brova_trialed',
        feedback_status = COALESCE(feedback_status, 'needs_repair')
    WHERE piece_stage = 'needs_repair'
    RETURNING id, garment_id
  `;
  console.log(`needs_repair → brova_trialed: ${needsRepair.length} rows`);

  // 4. needs_redo (as piece_stage) → brova_trialed + feedback_status='needs_redo'
  const needsRedo = await sql`
    UPDATE garments
    SET piece_stage = 'brova_trialed',
        feedback_status = COALESCE(feedback_status, 'needs_redo')
    WHERE piece_stage = 'needs_redo'
    RETURNING id, garment_id
  `;
  console.log(`needs_redo → brova_trialed: ${needsRedo.length} rows`);

  const total = atShopBrova.length + atShopFinal.length + atShopOther.length +
                accepted.length + needsRepair.length + needsRedo.length;
  console.log(`\n=== Migration complete: ${total} rows updated ===`);

  // Verify no deprecated values remain
  const remaining = await sql`
    SELECT piece_stage, COUNT(*) as cnt
    FROM garments
    WHERE piece_stage IN ('at_shop', 'accepted', 'needs_repair', 'needs_redo')
    GROUP BY piece_stage
  `;
  if (remaining.length > 0) {
    console.log("\n⚠ WARNING: Some deprecated values still remain:");
    for (const r of remaining) {
      console.log(`  ${r.piece_stage}: ${r.cnt} rows`);
    }
  } else {
    console.log("\n✓ No deprecated piece_stage values remain in the database.");
  }

  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
