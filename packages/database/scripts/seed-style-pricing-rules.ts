/**
 * Idempotent seed for `style_pricing_rules`.
 *
 * The table was created via `drizzle-kit db:push` (schema-only), so the seed
 * INSERT in migration 0012_style_pricing_rules.sql never ran and the table was
 * left empty — meaning the Designer (flat 6 KD) / Qallabi (flat 5 KD)
 * flat-override pricing was silently inactive. This seeds the baseline rows
 * from the live `styles.rate_per_item` values, replicating the original
 * hardcoded behavior. Safe to re-run (ON CONFLICT DO NOTHING).
 */
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await client`
    INSERT INTO style_pricing_rules (brand, style_code, rule_type, flat_rate, priority, active, description)
    SELECT s.brand, s.code, 'flat_override'::style_rule_type, s.rate_per_item, 0, true,
           CASE s.code
               WHEN 'STY_DESIGNER' THEN 'Designer style: flat rate, overrides all style options'
               WHEN 'COL_QALLABI'  THEN 'Qallabi collar: flat rate, overrides all style options'
           END
    FROM styles s
    WHERE s.code IN ('STY_DESIGNER', 'COL_QALLABI')
    ON CONFLICT (brand, style_code, priority) DO NOTHING
  `;

  const rules = await client`
    SELECT brand, style_code, rule_type, flat_rate, priority, active
    FROM style_pricing_rules
    ORDER BY brand, style_code, priority
  `;
  console.log("style_pricing_rules after seed:");
  console.table(rules);

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
