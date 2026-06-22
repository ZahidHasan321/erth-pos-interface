/**
 * Backfill: resolve Airtable blob/rec-id garment style fields to app style codes.
 *
 * The original import grabbed COLLAR IMAGE REQUESTED (blob), F PCK (blob), and
 * JABZOUR 2 IMAGE (blob) instead of the Name rec-id columns, and left
 * BUTTONS NAME REQUESTED as a raw rec-id. This script:
 *   1. Streams ORDERS.csv and resolves each row's rec-id → Airtable Name → app code.
 *   2. Batches UPDATEs against garments WHERE garment_id = PCE REF.
 *   3. Sets unmappable fields to NULL (no partial/blob values left behind).
 *
 * Idempotent: safe to re-run. Only touches the four style fields listed below.
 *
 *   pnpm --filter @repo/database exec tsx scripts/fix-garment-style-fields.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as csvParser from "csv-parse/sync";

dotenv.config({ path: path.join(__dirname, "../.env") });
const sql = postgres(process.env.DATABASE_URL!, { max: 4, idle_timeout: 10, connect_timeout: 20 });

const CSV_DIR =
    "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)/";

// ---------- Lookup maps: Airtable rec-id → app style code (or null) ----------

// COLLAR.csv: COLLAR NAME REQUESTED rec-id → collar_type code
const COLLAR_ID_TO_CODE: Record<string, string | null> = {
    rec6pnmxdqFSizMn8: "COL_QALLABI",       // QALABI COLLAR
    rec9DXvjmTxl3684Y: "COL_JAPANESE",       // JAPANES COLLAR
    rech6oeCWzLcZY27H: "COL_STRAIT_COLLAR",  // STRAIT COLLAR
    recosVrtpqvfjHkI5: "COL_DOWN_COLLAR",    // ROUND COLLAR
};

// BUTTONS.csv: BUTTONS NAME REQUESTED rec-id → collar_button code
// Airtable names (VISIBLE PUSH-BUTTON / VISIBLE BUTTON WITH BUTTONHOLE / MULTI HOLES)
// have no confident mapping to the app's Arabic button codes → all NULL.
const BUTTON_ID_TO_CODE: Record<string, string | null> = {
    rec9r0ARWTW11YeWH: null,  // VISIBLE PUSH-BUTTON
    rectmDeqxYCxZLwXW: null,  // VISIBLE BUTTON WITH BUTTONHOLE
    recuTpniPJ1KBqbwu: null,  // MULTI HOLES
};

// FRONT POCKET.csv: F PCK REQUESTED rec-id → front_pocket_type code
const FPCK_ID_TO_CODE: Record<string, string | null> = {
    rec7zQsKOiEzZXCYx: "FRO_MURABBA_FRONT_POCKET",          // SQUARE
    rec8CpxC11JmMC4eq: "FRO_MUDAWWAR_FRONT_POCKET",         // CIRCULAR
    recDn155eAsjNNik9: "FRO_MUSALLAS_FRONT_POCKET",         // WITH CORNER
    recixFlGw2UITSx5d: "FRO_MUDAWWAR_MAGFI_FRONT_POCKET",   // CIRCULAR WITHOUT THICKNESS
    reckP75Lb9xvVcXwS: null,                                 // TRIANGLE → no app code
};

// JABZOUR.csv: JABZOUR 2 NAME rec-id → jabzour_2 code
// Arabic LIBELLE: HIDE=مخفي(magfi), APPARENT=عادي(bain); +TRIANGLE=musallas, plain=murabba
const JAB_ID_TO_CODE: Record<string, string | null> = {
    rec0Rht57ky84wlUZ: null,               // ABU JARAH → no app code
    recQhXFu0Ns7dJ8AC: "JAB_MAGFI_MURABBA",     // HIDE
    recWXLz3taVVy1vkJ: "JAB_MAGFI_MUSALLAS",    // HIDE+TRIANGLE
    recdS78YwvcKPdavx: "JAB_BAIN_MURABBA",      // APPARENT
    recpzfm4ERqhwwnqm: "JAB_BAIN_MUSALLAS",     // APPARENT+TRIANGLE
};

// ---------- Print the maps for auditability ----------
function printMaps() {
    const airtableNames: Record<string, string> = {
        rec6pnmxdqFSizMn8: "QALABI COLLAR",
        rec9DXvjmTxl3684Y: "JAPANES COLLAR",
        rech6oeCWzLcZY27H: "STRAIT COLLAR",
        recosVrtpqvfjHkI5: "ROUND COLLAR",
        rec9r0ARWTW11YeWH: "VISIBLE PUSH-BUTTON",
        rectmDeqxYCxZLwXW: "VISIBLE BUTTON WITH BUTTONHOLE",
        recuTpniPJ1KBqbwu: "MULTI HOLES",
        rec7zQsKOiEzZXCYx: "SQUARE",
        rec8CpxC11JmMC4eq: "CIRCULAR",
        recDn155eAsjNNik9: "WITH CORNER",
        recixFlGw2UITSx5d: "CIRCULAR WITHOUT THICKNESS",
        reckP75Lb9xvVcXwS: "TRIANGLE",
        rec0Rht57ky84wlUZ: "ABU JARAH",
        recQhXFu0Ns7dJ8AC: "HIDE",
        recWXLz3taVVy1vkJ: "HIDE+TRIANGLE",
        recdS78YwvcKPdavx: "APPARENT",
        recpzfm4ERqhwwnqm: "APPARENT+TRIANGLE",
    };

    console.log("\n=== RESOLUTION MAPS (Airtable Name → app code, NULL = no match) ===");
    for (const [component, map] of [
        ["collar_type (COLLAR.csv)", COLLAR_ID_TO_CODE],
        ["collar_button (BUTTONS.csv)", BUTTON_ID_TO_CODE],
        ["front_pocket_type (FRONT POCKET.csv)", FPCK_ID_TO_CODE],
        ["jabzour_2 (JABZOUR.csv)", JAB_ID_TO_CODE],
    ] as [string, Record<string, string | null>][]) {
        console.log(`\n  ${component}:`);
        for (const [id, code] of Object.entries(map)) {
            const name = airtableNames[id] ?? id;
            console.log(`    ${name.padEnd(35)} → ${code ?? "NULL"}`);
        }
    }
}

// ---------- Stream ORDERS.csv and build garment_id → resolved values ----------

type ResolvedRow = {
    collar_type: string | null;
    collar_button: string | null;
    front_pocket_type: string | null;
    jabzour_2: string | null;
};

async function streamOrders(): Promise<Map<string, ResolvedRow>> {
    console.log("\n[stream] reading ORDERS.csv...");
    const ordersPath = path.join(CSV_DIR, "ORDERS.csv");

    // Stream line-by-line via Node readable to avoid loading 103MB into memory
    const { createReadStream } = fs;
    const readline = await import("readline");

    const rl = readline.createInterface({ input: createReadStream(ordersPath, "utf-8"), crlfDelay: Infinity });

    let headers: string[] = [];
    let lineNum = 0;
    const results = new Map<string, ResolvedRow>();

    for await (const line of rl) {
        lineNum++;
        if (lineNum === 1) {
            // Parse header — handle quoted fields via simple split (no commas in headers)
            headers = parseCsvLine(line);
            continue;
        }
        const cols = parseCsvLine(line);
        const row: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
            row[headers[i]!] = (cols[i] ?? "").trim();
        }

        const garmentId = (row["PCE REF"] ?? "").trim();
        if (!garmentId) continue;

        const collarRec = (row["COLLAR NAME REQUESTED"] ?? "").trim();
        const buttonRec = (row["BUTTONS NAME REQUESTED"] ?? "").trim();
        const fpckRec = (row["F PCK REQUESTED"] ?? "").trim();
        const jab2Rec = (row["JABZOUR 2 NAME"] ?? "").trim();

        results.set(garmentId, {
            collar_type: collarRec ? (COLLAR_ID_TO_CODE[collarRec] ?? null) : null,
            collar_button: buttonRec ? (BUTTON_ID_TO_CODE[buttonRec] ?? null) : null,
            front_pocket_type: fpckRec ? (FPCK_ID_TO_CODE[fpckRec] ?? null) : null,
            jabzour_2: jab2Rec ? (JAB_ID_TO_CODE[jab2Rec] ?? null) : null,
        });
    }

    console.log(`[stream] processed ${lineNum - 1} data rows, ${results.size} unique garment_ids`);
    return results;
}

// Minimal CSV line parser: handles double-quoted fields with commas inside.
function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

// ---------- Batch UPDATE ----------

const BATCH_SIZE = 200;

async function runBackfill(rows: Map<string, ResolvedRow>) {
    const entries = [...rows.entries()];
    console.log(`\n[backfill] ${entries.length} garments to update in batches of ${BATCH_SIZE}`);

    let updated = 0;
    let notFound = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        for (const [garmentId, vals] of batch) {
            const result = await sql`
                UPDATE garments SET
                    collar_type        = ${vals.collar_type},
                    collar_button      = ${vals.collar_button},
                    front_pocket_type  = ${vals.front_pocket_type},
                    jabzour_2          = ${vals.jabzour_2}
                WHERE garment_id = ${garmentId}
            `;
            if (result.count === 0) notFound++;
            else updated++;
        }
        if ((i / BATCH_SIZE) % 10 === 0) {
            process.stdout.write(`  ${i + batch.length}/${entries.length}\r`);
        }
    }

    console.log(`\n[backfill] updated=${updated} not_found=${notFound}`);
}

// ---------- Verify ----------

async function verify() {
    console.log("\n=== VERIFICATION ===");
    const result = await sql`
        SELECT
            count(*) FILTER (WHERE collar_type LIKE '{%' OR collar_type ~ '^rec[A-Za-z0-9]{14}$')       AS collar_type_dirty,
            count(*) FILTER (WHERE collar_button LIKE '{%' OR collar_button ~ '^rec[A-Za-z0-9]{14}$')   AS collar_button_dirty,
            count(*) FILTER (WHERE front_pocket_type LIKE '{%' OR front_pocket_type ~ '^rec[A-Za-z0-9]{14}$') AS front_pocket_type_dirty,
            count(*) FILTER (WHERE jabzour_2 LIKE '{%' OR jabzour_2 ~ '^rec[A-Za-z0-9]{14}$')          AS jabzour_2_dirty,
            count(*) FILTER (WHERE collar_type IS NOT NULL)       AS collar_type_set,
            count(*) FILTER (WHERE collar_type IS NULL)           AS collar_type_null,
            count(*) FILTER (WHERE collar_button IS NOT NULL)     AS collar_button_set,
            count(*) FILTER (WHERE collar_button IS NULL)         AS collar_button_null,
            count(*) FILTER (WHERE front_pocket_type IS NOT NULL) AS front_pocket_type_set,
            count(*) FILTER (WHERE front_pocket_type IS NULL)     AS front_pocket_type_null,
            count(*) FILTER (WHERE jabzour_2 IS NOT NULL)         AS jabzour_2_set,
            count(*) FILTER (WHERE jabzour_2 IS NULL)             AS jabzour_2_null
        FROM garments
    `;
    const r = result[0]!;
    const dirty = Number(r.collar_type_dirty) + Number(r.collar_button_dirty) + Number(r.front_pocket_type_dirty) + Number(r.jabzour_2_dirty);
    console.log(`  Remaining blobs/rec-ids: ${dirty} (must be 0)`);
    console.log(`  collar_type:       resolved=${r.collar_type_set}  null=${r.collar_type_null}  dirty=${r.collar_type_dirty}`);
    console.log(`  collar_button:     resolved=${r.collar_button_set}  null=${r.collar_button_null}  dirty=${r.collar_button_dirty}`);
    console.log(`  front_pocket_type: resolved=${r.front_pocket_type_set}  null=${r.front_pocket_type_null}  dirty=${r.front_pocket_type_dirty}`);
    console.log(`  jabzour_2:         resolved=${r.jabzour_2_set}  null=${r.jabzour_2_null}  dirty=${r.jabzour_2_dirty}`);
    if (dirty > 0) {
        console.error("\nERROR: still dirty after backfill");
        process.exitCode = 1;
    } else {
        console.log("\n  PASS: zero blobs/rec-ids remaining.");
    }
}

// ---------- Main ----------

(async () => {
    try {
        printMaps();
        const rows = await streamOrders();
        await runBackfill(rows);
        await verify();
    } catch (e) {
        console.error("FAIL:", (e as Error).message);
        process.exitCode = 1;
    } finally {
        await sql.end();
    }
})();
