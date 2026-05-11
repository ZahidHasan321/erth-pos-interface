/**
 * One-off applier for 0012_style_pricing_rules.sql.
 *
 * `pnpm db:migrate` is broken on this DB because migrations 0002–0011 were
 * applied via `drizzle-kit push` historically and never recorded in
 * `_migrations`. Re-running them would fail. This script applies just the new
 * file and records it.
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const FILENAME = "0012_style_pricing_rules.sql";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
    const already = await client`
        SELECT filename FROM _migrations WHERE filename = ${FILENAME}
    `;
    if (already.length > 0) {
        console.log(`Already applied: ${FILENAME}`);
        await client.end();
        return;
    }

    const sql = fs.readFileSync(
        path.join(__dirname, "..", "migrations", FILENAME),
        "utf-8",
    );

    await client.begin(async (tx) => {
        await tx.unsafe(sql);
        await tx`
            INSERT INTO _migrations (filename) VALUES (${FILENAME})
        `;
    });

    console.log(`Applied ${FILENAME}`);

    const rules = await client`
        SELECT brand, style_code, rule_type, flat_rate, active
        FROM style_pricing_rules
        ORDER BY brand, style_code
    `;
    console.log("\nSeeded rules:");
    console.table(rules);

    await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
