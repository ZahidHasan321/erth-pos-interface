/**
 * Copy the workshop team structure (units) from the OLD backend into the target.
 *   OLD_DATABASE_URL=<old pooler url> pnpm --filter @repo/database exec tsx scripts/seed-units-from-old.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });
const OLD = process.env.OLD_DATABASE_URL;
if (!OLD) { console.error("set OLD_DATABASE_URL"); process.exit(1); }

const src = postgres(OLD, { max: 1, prepare: false, connect_timeout: 20 });
const dst = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 20 });

(async () => {
    try {
        const units = await src`select id, stage, name, notes, daily_target, created_at, updated_at from units order by stage, created_at`;
        console.log(`OLD units: ${units.length}`);
        for (const u of units as any[]) console.log(`  ${String(u.stage).padEnd(14)} ${u.name}`);
        if (units.length) {
            await dst`insert into units ${dst(units as any[], "id", "stage", "name", "notes", "daily_target", "created_at", "updated_at")}
                on conflict (id) do nothing`;
        }
        const n = await dst`select count(*)::int n from units`;
        console.log(`target units now: ${(n[0] as any).n}`);
    } catch (e) {
        console.error("FAIL:", (e as Error).message);
        process.exitCode = 1;
    } finally {
        await src.end(); await dst.end();
    }
})();
