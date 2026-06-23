/**
 * Backfill garments.collar_button (NULL'd in the first pass because the Airtable
 * BUTTONS `Name` column didn't map). The button's true identity is its image
 * ATTACHMENT (SKETCHES B) filename -> app code. Maps rec-id (ORDERS.BUTTONS NAME
 * REQUESTED) -> BUTTONS.csv attachment filename -> app code. Idempotent (only
 * fills NULLs). Re-runnable.
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { parse as parseCsv } from "csv-parse/sync";

dotenv.config({ path: path.join(__dirname, "../.env") });
const DIR = path.resolve(__dirname, "../../../../seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)");
const sql = postgres(process.env.DATABASE_URL!, { max: 3, connect_timeout: 20 });

// Airtable button image filename (SKETCHES B) -> app collar-button code.
const FILE_TO_CODE: Record<string, string> = {
    "TABAGI.jpeg": "COL_TABBAGI",                 // MULTI HOLES
    "TQBQGGI ZIRAR.jpeg": "COL_ZARRAR__TABBAGI",  // VISIBLE PUSH-BUTTON ("Tabbagi Zarrar")
    "BUTTONWHOLE.jpeg": "COL_ARAVI_ZARRAR",       // VISIBLE BUTTON WITH BUTTONHOLE
};

function load(name: string): Record<string, string>[] {
    return parseCsv(fs.readFileSync(path.join(DIR, name), "utf8"),
        { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, trim: true });
}
const firstSeg = (v: string | undefined) => (v || "").split(",")[0]!.trim();

(async () => {
    try {
        // rec-id -> code, via BUTTONS.csv attachment filename
        const recToCode = new Map<string, string>();
        for (const r of load("BUTTONS.csv")) {
            const id = (r["airtable_id"] || "").trim();
            const code = FILE_TO_CODE[(r["SKETCHES B"] || "").trim()];
            if (id && code) recToCode.set(id, code);
        }
        console.log("button rec-id -> code:");
        for (const [k, v] of recToCode) console.log(`  ${k} -> ${v}`);

        // PCE REF -> code, via ORDERS.BUTTONS NAME REQUESTED
        const byCode: Record<string, string[]> = {};
        for (const r of load("ORDERS.csv")) {
            const pce = (r["PCE REF"] || "").trim();
            const code = recToCode.get(firstSeg(r["BUTTONS NAME REQUESTED"]));
            if (pce && code) (byCode[code] ??= []).push(pce);
        }

        let totalSet = 0;
        for (const [code, ids] of Object.entries(byCode)) {
            // chunk the IN-list to keep statements reasonable
            let set = 0;
            for (let i = 0; i < ids.length; i += 1000) {
                const chunk = ids.slice(i, i + 1000);
                const res = await sql`
                    update garments set collar_button = ${code}
                    where garment_id in ${sql(chunk)} and collar_button is null returning id`;
                set += res.length;
            }
            totalSet += set;
            console.log(`  ${code}: matched ${ids.length} pieces, set ${set}`);
        }
        const left = await sql<{ n: number }[]>`select count(collar_button)::int n from garments`;
        console.log(`\ntotal collar_button set this run: ${totalSet}; non-null now: ${left[0]!.n}`);
    } catch (e) { console.error("FAIL:", (e as Error).message); process.exitCode = 1; }
    finally { await sql.end(); }
})();
