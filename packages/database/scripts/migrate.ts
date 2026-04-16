/**
 * Hand-written migration runner.
 *
 * Each file in ../migrations/*.sql runs once in lexicographic order. Applied
 * filenames are recorded in the `_migrations` table so reruns are no-ops.
 *
 * By default each file is wrapped in a transaction. If a file contains the
 * marker `-- no-transaction` (e.g. for `ALTER TYPE ... ADD VALUE`, which can't
 * run in a tx), it executes without one.
 *
 * Usage: pnpm --filter @repo/database db:migrate
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });

const MIGRATIONS_DIR = path.join(__dirname, "../migrations");

async function ensureMigrationsTable() {
    await client.unsafe(`
        CREATE TABLE IF NOT EXISTS _migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);
}

async function getAppliedFilenames(): Promise<Set<string>> {
    const rows = await client<{ filename: string }[]>`
        SELECT filename FROM _migrations
    `;
    return new Set(rows.map(r => r.filename));
}

function listMigrationFiles(): string[] {
    if (!fs.existsSync(MIGRATIONS_DIR)) return [];
    return fs
        .readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith(".sql"))
        .sort();
}

async function applyMigration(filename: string) {
    const fullPath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(fullPath, "utf-8");
    const noTx = /--\s*no-transaction/i.test(sql);

    console.log(`  → ${filename}${noTx ? " (no-transaction)" : ""}`);

    if (noTx) {
        await client.unsafe(sql);
        await client`INSERT INTO _migrations (filename) VALUES (${filename})`;
    } else {
        await client.begin(async tx => {
            await tx.unsafe(sql);
            await tx`INSERT INTO _migrations (filename) VALUES (${filename})`;
        });
    }
}

async function main() {
    await ensureMigrationsTable();

    const applied = await getAppliedFilenames();
    const all = listMigrationFiles();
    const pending = all.filter(f => !applied.has(f));

    if (pending.length === 0) {
        console.log("No pending migrations.");
        return;
    }

    console.log(`Applying ${pending.length} migration(s):`);
    for (const file of pending) {
        await applyMigration(file);
    }
    console.log("Done.");
}

main()
    .catch(err => {
        console.error("Migration failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await client.end();
    });
