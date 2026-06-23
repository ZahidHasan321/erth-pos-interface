/**
 * Seed base pricing config (prices + styles + style_pricing_rules) into the
 * target DB by snapshotting the OLD backend (the source of truth for current
 * prices, incl. the sheet2 update). Writes a reusable snapshot JSON, then upserts.
 *
 *   OLD_DATABASE_URL=<old session/txn pooler url> \
 *     pnpm --filter @repo/database exec tsx scripts/seed-pricing-from-old.ts
 *   add --apply to write to the target (DATABASE_URL); default is inspect-only.
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.join(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const OLD = process.env.OLD_DATABASE_URL;
if (!OLD) { console.error("set OLD_DATABASE_URL"); process.exit(1); }

const src = postgres(OLD, { max: 1, prepare: false, connect_timeout: 20 }); // old = txn pooler
const dst = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 20 });

(async () => {
    try {
        const prices = await src`select key, brand, value, description, updated_at from prices order by brand, key`;
        const styles = await src`select name, type, rate_per_item, image_url, code, component, brand from styles order by brand, type, name`;
        const rules = await src`select brand, style_code, rule_type, flat_rate, priority, active, description from style_pricing_rules order by brand, style_code, priority`;
        console.log(`OLD backend -> prices=${prices.length} styles=${styles.length} style_pricing_rules=${rules.length}`);

        // show price values so we can eyeball sheet2 (express 5, qallabi 3, designer 6)
        console.log("\nprices (ERTH):");
        for (const p of prices.filter((r: any) => r.brand === "ERTH")) console.log(`  ${String(p.key).padEnd(22)} ${p.value}`);
        console.log("\nstyle_pricing_rules:");
        for (const r of rules) console.log(`  ${r.brand}/${r.style_code} ${r.rule_type} flat=${r.flat_rate} prio=${r.priority} active=${r.active}`);

        const snapPath = path.join(__dirname, "pricing-snapshot.json");
        fs.writeFileSync(snapPath, JSON.stringify({ prices, styles, rules }, null, 2));
        console.log(`\nsnapshot written: ${snapPath}`);

        if (!APPLY) { console.log("\n(inspect-only; re-run with --apply to write to target)"); return; }

        console.log(`\nAPPLYING to target ${process.env.DATABASE_URL!.split("@")[1]} ...`);
        if (prices.length) {
            await dst`insert into prices ${dst(prices as any[], "key", "brand", "value", "description", "updated_at")}
                on conflict (key, brand) do update set value = excluded.value, description = excluded.description, updated_at = excluded.updated_at`;
        }
        // styles: replace the import's component-style rows with the canonical set
        await dst`delete from styles`;
        if (styles.length) {
            await dst`insert into styles ${dst(styles as any[], "name", "type", "rate_per_item", "image_url", "code", "component", "brand")}`;
        }
        if (rules.length) {
            await dst`insert into style_pricing_rules ${dst(rules as any[], "brand", "style_code", "rule_type", "flat_rate", "priority", "active", "description")}
                on conflict (brand, style_code, priority) do update set rule_type = excluded.rule_type, flat_rate = excluded.flat_rate, active = excluded.active, description = excluded.description`;
        }
        const after = await dst`select 'prices' t, count(*)::int n from prices union all select 'styles', count(*)::int from styles union all select 'style_pricing_rules', count(*)::int from style_pricing_rules`;
        console.log("target after:", after.map((r: any) => `${r.t}=${r.n}`).join(" "));
    } catch (e) {
        console.error("FAIL:", (e as Error).message);
        process.exitCode = 1;
    } finally {
        await src.end(); await dst.end();
    }
})();
