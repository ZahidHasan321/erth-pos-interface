/**
 * Seed office users (admin + managers + office staff). PIN is 1234 for every
 * account. Idempotent — updates on username conflict.
 *
 * Run: pnpm --filter @repo/database db:seed-office-users
 */

import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

type Seed = {
  username: string;
  name: string;
  role: "super_admin" | "admin" | "manager" | "staff" | "cashier";
  department: "workshop" | "shop" | null;
  brands?: string[];
};

const USERS: Seed[] = [
  // Shop-department users MUST carry at least one brand or they are locked out
  // of every write (can_access_brand denies a NULL/empty brands array; enforced
  // by the users_shop_requires_brands CHECK constraint). shop_manager doubles as
  // the multi-brand admin test account, so it gets all three.
  { username: "admin",        name: "Super Admin",       role: "super_admin", department: null },
  { username: "ws_manager",   name: "Workshop Manager",  role: "manager",     department: "workshop" },
  { username: "shop_manager", name: "Shop Manager",      role: "manager",     department: "shop", brands: ["erth", "sakkba", "qass"] },
  { username: "ws_office",    name: "Workshop Office",   role: "staff",       department: "workshop" },
  { username: "shop_office",  name: "Shop Office",       role: "staff",       department: "shop", brands: ["erth"] },
  { username: "cashier",      name: "Cashier",           role: "cashier",     department: "shop", brands: ["erth"] },
];

const PIN = "1234";

async function main() {
  console.log(`\nSeeding ${USERS.length} office users (PIN=${PIN})...`);

  for (const u of USERS) {
    const brandsArr = u.brands ?? null;
    const [user] = await sql<{ id: string; created: boolean }[]>`
      INSERT INTO users (username, name, role, department, job_functions, brands, is_active, pin)
      VALUES (
        ${u.username}, ${u.name}, ${u.role}::role, ${u.department}::department,
        '{}'::job_function[], ${brandsArr as any},
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

    console.log(
      `  ${user.created ? "+" : "~"} ${u.username.padEnd(14)} ${u.name.padEnd(22)} [${u.role}${u.department ? "/" + u.department : ""}${u.brands ? "/" + u.brands.join(",") : ""}]`
    );
  }

  await sql.end();
  console.log("\nDone. Login with any of the above usernames + PIN 1234.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
