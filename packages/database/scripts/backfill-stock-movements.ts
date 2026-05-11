import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

/**
 * Backfill stock_movements ledger from existing transferRequests history.
 *
 * For each historical transfer item that has dispatched_qty / received_qty /
 * missing_qty set, insert the corresponding ledger rows so the new Reports
 * page has past data to graph.
 *
 * - Direct fabric/shelf/accessory edits CANNOT be backfilled (no history).
 * - Order consumption (sales/work orders) CANNOT be backfilled (no per-item
 *   timestamp on consumption — only order created_at).
 *
 * Marker: every backfilled row has notes='backfilled from transfer history'.
 * Refuses to re-run if any backfilled rows already exist.
 */
async function main() {
  console.log("Backfilling stock_movements from transfer history…");

  const existing = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM stock_movements
    WHERE notes = 'backfilled from transfer history'
  `);
  const count = (existing as unknown as Array<{ count: number }>)[0]?.count ?? 0;
  if (count > 0) {
    console.log(`Refusing to re-run: ${count} backfilled rows already exist.`);
    process.exit(0);
  }

  // 1. transfer_out rows for every dispatched item
  const dispatchOut = await db.execute(sql`
    INSERT INTO stock_movements (
      item_type, item_id, location, movement_type, qty_delta,
      ref_type, ref_id, user_id, reason, notes, created_at
    )
    SELECT
      CASE
        WHEN tri.fabric_id IS NOT NULL THEN 'fabric'::stock_item_type
        WHEN tri.shelf_id IS NOT NULL THEN 'shelf'::stock_item_type
        WHEN tri.accessory_id IS NOT NULL THEN 'accessory'::stock_item_type
      END,
      COALESCE(tri.fabric_id, tri.shelf_id, tri.accessory_id),
      CASE WHEN tr.direction = 'shop_to_workshop' THEN 'shop'::stock_location
           ELSE 'workshop'::stock_location END,
      'transfer_out'::stock_movement_type,
      -tri.dispatched_qty,
      'transfer', tr.id, tr.dispatched_by,
      'transfer dispatch',
      'backfilled from transfer history',
      tr.dispatched_at
    FROM transfer_request_items tri
    JOIN transfer_requests tr ON tr.id = tri.transfer_request_id
    WHERE tri.dispatched_qty IS NOT NULL AND tr.dispatched_at IS NOT NULL
  `);
  console.log(`  transfer_out rows inserted: ${(dispatchOut as any).count ?? "?"}`);

  // 2. transfer_in rows for every received item
  const receiveIn = await db.execute(sql`
    INSERT INTO stock_movements (
      item_type, item_id, location, movement_type, qty_delta,
      ref_type, ref_id, user_id, reason, notes, created_at
    )
    SELECT
      CASE
        WHEN tri.fabric_id IS NOT NULL THEN 'fabric'::stock_item_type
        WHEN tri.shelf_id IS NOT NULL THEN 'shelf'::stock_item_type
        WHEN tri.accessory_id IS NOT NULL THEN 'accessory'::stock_item_type
      END,
      COALESCE(tri.fabric_id, tri.shelf_id, tri.accessory_id),
      CASE WHEN tr.direction = 'shop_to_workshop' THEN 'workshop'::stock_location
           ELSE 'shop'::stock_location END,
      'transfer_in'::stock_movement_type,
      tri.received_qty,
      'transfer', tr.id, tr.received_by,
      'transfer receipt',
      'backfilled from transfer history',
      tr.received_at
    FROM transfer_request_items tri
    JOIN transfer_requests tr ON tr.id = tri.transfer_request_id
    WHERE tri.received_qty IS NOT NULL AND tr.received_at IS NOT NULL
  `);
  console.log(`  transfer_in rows inserted: ${(receiveIn as any).count ?? "?"}`);

  // 3. waste rows for missing-in-transit
  const wasteRows = await db.execute(sql`
    INSERT INTO stock_movements (
      item_type, item_id, location, movement_type, qty_delta,
      ref_type, ref_id, user_id, reason, notes, created_at
    )
    SELECT
      CASE
        WHEN tri.fabric_id IS NOT NULL THEN 'fabric'::stock_item_type
        WHEN tri.shelf_id IS NOT NULL THEN 'shelf'::stock_item_type
        WHEN tri.accessory_id IS NOT NULL THEN 'accessory'::stock_item_type
      END,
      COALESCE(tri.fabric_id, tri.shelf_id, tri.accessory_id),
      CASE WHEN tr.direction = 'shop_to_workshop' THEN 'shop'::stock_location
           ELSE 'workshop'::stock_location END,
      'waste'::stock_movement_type,
      -tri.missing_qty,
      'transfer', tr.id, tr.received_by,
      'lost in transit',
      'backfilled from transfer history',
      tr.received_at
    FROM transfer_request_items tri
    JOIN transfer_requests tr ON tr.id = tri.transfer_request_id
    WHERE COALESCE(tri.missing_qty, 0) > 0 AND tr.received_at IS NOT NULL
  `);
  console.log(`  waste rows inserted: ${(wasteRows as any).count ?? "?"}`);

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
