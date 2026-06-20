/**
 * Seed the local Supabase DB for the E2E harness:
 *   1. reference data (catalog / customer / open register)
 *   2. three loginnable users (order-taker / cashier / workshop) with a PIN
 *
 * Loginnable = a public.users row with a bcrypt PIN. We do NOT pre-create the
 * GoTrue auth.users row: login_with_pin (the same RPC the apps call) mints it
 * lazily on first sign-in. So a public.users row + PIN is all that's required —
 * exactly what packages/database/scripts/test-login-e2e.ts relies on.
 *
 * The reference-data inserts mirror packages/database/scripts/lifecycle/seed.ts
 * and reuse its pinned fixture IDs (imported below) so there is no magic-number
 * drift. They are inlined rather than calling seedReferenceData() directly
 * because that helper binds `brands` via postgres.js `sql.array()`, which under
 * PG17 (Supabase local) mis-serializes a single-element text[] as scalar text
 * when mixed with other typed casts in the same statement. Passing a raw JS
 * array (`${[brand]}`) sidesteps the quirk without editing the shared helper
 * (which the workflow test suite depends on, and runs against PG16).
 *
 * SAFETY: connects to the hardcoded LOCAL DB (e2e/config DATABASE_URL). It never
 * loads dotenv, so it can never reach the prod URL in packages/database/.env.
 *
 * Idempotent — re-running updates/leaves rows in place.
 */
import postgres from "postgres";
import { DATABASE_URL, BRAND, PIN, USERS } from "../config";

// packages/database is CommonJS (no "type":"module"); under tsx its named
// exports land on the interop default object, not as ESM named imports.
import fixturesModule from "../../packages/database/scripts/lifecycle/fixtures";
const fx = fixturesModule as unknown as {
  CUSTOMER_ID: number;
  FABRIC_A_ID: number;
  FABRIC_B_ID: number;
  STYLE_ID: number;
  SHELF_A_ID: number;
  SHELF_B_ID: number;
  CAMPAIGN_ID: number;
};

const sql = postgres(DATABASE_URL, { max: 1 });
const BRAND_UPPER = BRAND.toUpperCase(); // enum/brand columns store upper-case.

async function seedReference(): Promise<void> {
  // Customer
  await sql`
    INSERT INTO customers (id, name, phone)
    VALUES (${fx.CUSTOMER_ID}, 'Test Customer', '+96500000000')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('customers','id'), (SELECT MAX(id) FROM customers))`;

  // Fabrics (ample stock)
  await sql`
    INSERT INTO fabrics (id, name, color, real_stock, shop_stock, workshop_stock, price_per_meter)
    VALUES
      (${fx.FABRIC_A_ID}, 'Fabric A', 'C01', 1000, 1000, 0, 5.000),
      (${fx.FABRIC_B_ID}, 'Fabric B', 'C02', 1000, 1000, 0, 6.000)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('fabrics','id'), (SELECT MAX(id) FROM fabrics))`;

  // Style
  await sql`
    INSERT INTO styles (id, name, type, rate_per_item, code, brand)
    VALUES (${fx.STYLE_ID}, 'Kuwaiti Standard', 'collar', 3.000, 'STD', ${BRAND_UPPER}::brand)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('styles','id'), (SELECT MAX(id) FROM styles))`;

  // Shelf items
  await sql`
    INSERT INTO shelf (id, type, brand, stock, shop_stock, workshop_stock, price)
    VALUES
      (${fx.SHELF_A_ID}, 'Ready Dishdasha M', ${BRAND_UPPER}, 100, 100, 0, 25.000),
      (${fx.SHELF_B_ID}, 'Ready Dishdasha L', ${BRAND_UPPER}, 100, 100, 0, 27.000)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('shelf','id'), (SELECT MAX(id) FROM shelf))`;

  // Campaign
  await sql`
    INSERT INTO campaigns (id, name, active)
    VALUES (${fx.CAMPAIGN_ID}, 'Default Campaign', true)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('campaigns','id'), (SELECT MAX(id) FROM campaigns))`;

  // Prices (toggle_home_delivery reads HOME_DELIVERY)
  await sql`
    INSERT INTO prices (key, brand, value)
    VALUES ('HOME_DELIVERY', ${BRAND_UPPER}::brand, 2.000)
    ON CONFLICT (key, brand) DO NOTHING
  `;
}

async function seedUser(u: (typeof USERS)[keyof typeof USERS]): Promise<void> {
  const [row] = await sql<{ id: string; created: boolean }[]>`
    INSERT INTO users (username, name, role, department, job_functions, brands, is_active, pin)
    VALUES (
      ${u.username}, ${u.name}, ${u.role}::role, ${u.department}::department,
      ${u.jobFunctions}::job_function[],
      ${[BRAND]},
      true,
      crypt(${PIN}, gen_salt('bf', 8))
    )
    ON CONFLICT (username) DO UPDATE SET
      name          = EXCLUDED.name,
      role          = EXCLUDED.role,
      department    = EXCLUDED.department,
      job_functions = EXCLUDED.job_functions,
      brands        = EXCLUDED.brands,
      is_active     = true,
      pin           = crypt(${PIN}, gen_salt('bf', 8)),
      failed_login_attempts = 0,
      locked_until  = NULL,
      updated_at    = now()
    RETURNING id, (xmax = 0) AS created
  `;
  console.log(`  ${row.created ? "+" : "~"} ${u.username.padEnd(16)} [${u.role}/${u.department}]`);
}

async function main() {
  if (!DATABASE_URL.includes("127.0.0.1:54322")) {
    throw new Error(`Refusing to seed non-local DB: ${DATABASE_URL}`);
  }

  console.log("Seeding reference data (catalog / customer / register)...");
  await seedReference();

  // Open ERTH register session for today (required by any money flow later).
  await sql`
    INSERT INTO register_sessions (brand, date, status, opened_by, opening_float)
    VALUES (
      ${BRAND_UPPER}::brand, CURRENT_DATE, 'open',
      (SELECT id FROM users WHERE username = ${USERS.cashier.username}), 0
    )
    ON CONFLICT (brand, date) DO UPDATE SET status = 'open'
  `.catch(() => {
    // opened_by may be null on the very first run before the cashier exists;
    // re-attempted below after users are seeded.
  });

  console.log(`\nSeeding 3 loginnable users (PIN=${PIN})...`);
  for (const u of Object.values(USERS)) {
    await seedUser(u);
  }

  // Now the cashier exists — ensure today's register session is open + owned.
  await sql`
    INSERT INTO register_sessions (brand, date, status, opened_by, opening_float)
    VALUES (
      ${BRAND_UPPER}::brand, CURRENT_DATE, 'open',
      (SELECT id FROM users WHERE username = ${USERS.cashier.username}), 0
    )
    ON CONFLICT (brand, date) DO UPDATE SET status = 'open'
  `;

  await sql.end();
  console.log("\nDone. Users can log in through the real PIN UI.\n");
}

main().catch(async (e) => {
  console.error(e);
  await sql.end().catch(() => {});
  process.exit(1);
});
