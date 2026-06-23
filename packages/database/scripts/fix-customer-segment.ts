/**
 * Backfill fix: customers.customer_segment got raw Airtable rec-ids when the
 * importer fell back to the `TYPE CUSTOMER` link column. Resolve each rec-id to
 * the TYPE CUSTOMER lookup Name; blank (NULL) any that don't map. Idempotent.
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { parse as parseCsv } from "csv-parse/sync";

dotenv.config({ path: path.join(__dirname, "../.env") });
const DIR = path.resolve(__dirname, "../../../../seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)");
const sql = postgres(process.env.DATABASE_URL!, { max: 2, connect_timeout: 20 });

(async () => {
    try {
        const rows = parseCsv(fs.readFileSync(path.join(DIR, "TYPE CUSTOMER.csv"), "utf8"),
            { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, trim: true }) as Record<string, string>[];
        const map = new Map<string, string>();
        for (const r of rows) {
            const id = (r["airtable_id"] || "").trim();
            const name = (r["Name"] || "").trim();
            if (id && name) map.set(id, name);
        }
        console.log("TYPE CUSTOMER map:", [...map.entries()].map(([k, v]) => `${k}=${v}`).join(", "));

        const dirty = await sql<{ customer_segment: string }[]>`
            select distinct customer_segment from customers where customer_segment ~ '^rec[A-Za-z0-9]{14}'`;
        let resolved = 0, blanked = 0;
        for (const d of dirty) {
            const recid = d.customer_segment.split(",")[0]!.trim();
            const name = map.get(recid) ?? null;
            const res = await sql`
                update customers set customer_segment = ${name}
                where customer_segment = ${d.customer_segment} returning id`;
            if (name) resolved += res.length; else blanked += res.length;
            console.log(`  ${d.customer_segment.slice(0, 20)} -> ${name ?? "NULL"}  (${res.length} rows)`);
        }
        const left = await sql<{ n: number }[]>`select count(*)::int n from customers where customer_segment ~ '^rec[A-Za-z0-9]{14}'`;
        console.log(`\nresolved=${resolved} blanked=${blanked}  rec-ids remaining=${left[0]!.n}`);
    } catch (e) { console.error("FAIL:", (e as Error).message); process.exitCode = 1; }
    finally { await sql.end(); }
})();
