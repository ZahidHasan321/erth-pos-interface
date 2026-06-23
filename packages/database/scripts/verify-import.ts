/**
 * Post-migration sanity check: row counts per table + FK-linkage coverage.
 * Run after import-airtable.ts --run against the target DB.
 *   pnpm --filter @repo/database exec tsx scripts/verify-import.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });
const sql = postgres(process.env.DATABASE_URL!, { max: 2, idle_timeout: 5, connect_timeout: 15 });

(async () => {
    try {
        const counts = await sql<{ t: string; n: number }[]>`
            select 'customers' t, count(*)::int n from customers
            union all select 'fabrics', count(*)::int from fabrics
            union all select 'styles', count(*)::int from styles
            union all select 'campaigns', count(*)::int from campaigns
            union all select 'measurements', count(*)::int from measurements
            union all select 'orders', count(*)::int from orders
            union all select 'work_orders', count(*)::int from work_orders
            union all select 'garments', count(*)::int from garments
            union all select 'payment_transactions', count(*)::int from payment_transactions
            union all select 'shelf', count(*)::int from shelf
        `;
        console.log("\n=== ROW COUNTS ===");
        for (const r of counts) console.log(`  ${r.t.padEnd(22)} ${r.n}`);

        const link = await sql<{ k: string; n: number; total: number }[]>`
            select 'garments.fabric_id' k, count(fabric_id)::int n, count(*)::int total from garments
            union all select 'garments.measurement_id', count(measurement_id)::int, count(*)::int from garments
            union all select 'garments.order_id', count(order_id)::int, count(*)::int from garments
            union all select 'measurements.customer_id', count(customer_id)::int, count(*)::int from measurements
            union all select 'orders.customer_id', count(customer_id)::int, count(*)::int from orders
            union all select 'work_orders.invoice_number', count(invoice_number)::int, count(*)::int from work_orders
        `;
        console.log("\n=== FK LINKAGE COVERAGE (non-null / total) ===");
        for (const r of link) {
            const pct = r.total ? Math.round((r.n / r.total) * 100) : 0;
            console.log(`  ${r.k.padEnd(28)} ${r.n}/${r.total}  (${pct}%)`);
        }

        const orphanG = await sql<{ n: number }[]>`
            select count(*)::int n from garments g
            left join orders o on o.id = g.order_id where o.id is null
        `;
        console.log("\n=== INTEGRITY ===");
        console.log(`  garments with missing order: ${orphanG[0]!.n}`);
    } catch (e) {
        console.error("VERIFY FAIL:", (e as Error).message);
        process.exitCode = 1;
    } finally {
        await sql.end();
    }
})();
