/**
 * Finalize the historical archive on the target DB:
 *  1. Remove the 22 active/in-production orders (re-entered manually, not archived).
 *  2. Settle the remaining confirmed WORK orders as paid history -- via a settlement
 *     payment_transaction (so the orders.paid trigger derives it; we never write paid directly).
 *  3. Mark them completed + cashier-processed so they don't pollute the cashier queues.
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });
const sql = postgres(process.env.DATABASE_URL!, { max: 2, connect_timeout: 15 });

// FATOURA -> invoice_number for the 22 active orders (no leading zeros to strip here).
const ACTIVE_INV = [
    7000078, 7000080, 1298, 1299, 1709, 2179, 7000049, 1953, 2342, 9000025,
    9000024, 2465, 1348, 2013, 7000102, 2312, 7000103, 2456, 2460, 2466, 7000079, 2455,
];

(async () => {
    try {
        // 1. delete active orders (cascade removes work_orders/garments/payments)
        const del = await sql`
            DELETE FROM orders WHERE id IN (
                SELECT order_id FROM work_orders WHERE invoice_number IN ${sql(ACTIVE_INV)}
            ) RETURNING id
        `;
        console.log(`deleted active orders: ${del.length}`);

        // 2. settlement transactions -> trigger sums orders.paid up to order_total
        const settle = await sql`
            INSERT INTO payment_transactions (order_id, amount, payment_type, payment_note, transaction_type)
            SELECT o.id, (o.order_total - COALESCE(o.paid, 0)), 'cash', 'legacy settlement (archive)', 'payment'
            FROM orders o
            WHERE o.checkout_status = 'confirmed' AND o.order_type = 'WORK'
              AND o.order_total IS NOT NULL AND o.order_total > COALESCE(o.paid, 0)
            RETURNING id
        `;
        console.log(`settlement transactions inserted: ${settle.length}`);

        // 3. mark completed + cashier-processed (so they're out of Pending and read as done)
        const ph = await sql`
            UPDATE work_orders wo SET
                order_phase = 'completed',
                cashier_processed_at = COALESCE(wo.cashier_processed_at, o.order_date, now())
            FROM orders o
            WHERE wo.order_id = o.id AND o.checkout_status = 'confirmed' AND o.order_type = 'WORK'
            RETURNING wo.order_id
        `;
        console.log(`work_orders marked completed + processed: ${ph.length}`);

        // 4. summary
        const counts = await sql<{ t: string; n: number }[]>`
            select 'orders' t, count(*)::int n from orders
            union all select 'work_orders', count(*)::int from work_orders
            union all select 'garments', count(*)::int from garments
            union all select 'payment_transactions', count(*)::int from payment_transactions
        `;
        const phase = await sql<{ order_phase: string; n: number }[]>`
            select order_phase, count(*)::int n from work_orders group by order_phase order by n desc
        `;
        const settled = await sql<{ n: number; owing: number }[]>`
            select count(*) filter (where paid >= order_total)::int n,
                   count(*) filter (where order_total is not null and paid < order_total)::int owing
            from orders where checkout_status='confirmed' and order_type='WORK'
        `;
        console.log("\n=== AFTER ===");
        for (const r of counts) console.log(`  ${r.t.padEnd(22)} ${r.n}`);
        console.log("  work_orders.order_phase:", phase.map(p => `${p.order_phase}=${p.n}`).join(" "));
        console.log(`  confirmed WORK fully-paid: ${settled[0]!.n}  still-owing: ${settled[0]!.owing}`);
    } catch (e) {
        console.error("SETTLE FAIL:", (e as Error).message);
        process.exitCode = 1;
    } finally {
        await sql.end();
    }
})();
