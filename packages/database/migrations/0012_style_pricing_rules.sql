-- Style pricing override rules. Configurable replacement for hardcoded
-- "designer = 6 KD flat" / "qallabi = 5 KD flat" conditionals in POS.

DO $$ BEGIN
    CREATE TYPE style_rule_type AS ENUM ('flat_override', 'additive');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS style_pricing_rules (
    id           SERIAL PRIMARY KEY,
    brand        brand NOT NULL,
    style_code   TEXT NOT NULL,
    rule_type    style_rule_type NOT NULL,
    flat_rate    NUMERIC(10, 3),
    priority     INTEGER NOT NULL DEFAULT 0,
    active       BOOLEAN NOT NULL DEFAULT true,
    description  TEXT,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS style_pricing_rules_brand_code_idx
    ON style_pricing_rules (brand, style_code, active);

CREATE UNIQUE INDEX IF NOT EXISTS style_pricing_rules_brand_code_priority_idx
    ON style_pricing_rules (brand, style_code, priority);

-- Seed: replicate current hardcoded behavior. Designer/Qallabi flat-override
-- per brand, using current styles.rate_per_item values.
INSERT INTO style_pricing_rules (brand, style_code, rule_type, flat_rate, priority, active, description)
SELECT s.brand, s.code, 'flat_override'::style_rule_type, s.rate_per_item, 0, true,
       CASE s.code
           WHEN 'STY_DESIGNER' THEN 'Designer style: flat rate, overrides all style options'
           WHEN 'COL_QALLABI'  THEN 'Qallabi collar: flat rate, overrides all style options'
       END
FROM styles s
WHERE s.code IN ('STY_DESIGNER', 'COL_QALLABI')
ON CONFLICT (brand, style_code, priority) DO NOTHING;
