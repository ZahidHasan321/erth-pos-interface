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
  role: "super_admin" | "admin" | "manager" | "staff";
  department: "workshop" | "shop" | null;
};

const USERS: Seed[] = [
  { username: "admin",        name: "Super Admin",       role: "super_admin", department: null },
  { username: "ws_manager",   name: "Workshop Manager",  role: "manager",     department: "workshop" },
  { username: "shop_manager", name: "Shop Manager",      role: "manager",     department: "shop" },
  { username: "ws_office",    name: "Workshop Office",   role: "staff",       department: "workshop" },
  { username: "shop_office",  name: "Shop Office",       role: "staff",       department: "shop" },
];

const PIN = "1234";

async function main() {
  console.log(`\nSeeding ${USERS.length} office users (PIN=${PIN})...`);

  for (const u of USERS) {
    const [user] = await sql<{ id: string; created: boolean }[]>`
      INSERT INTO users (username, name, role, department, job_functions, is_active, pin)
      VALUES (
        ${u.username}, ${u.name}, ${u.role}::role, ${u.department}::department,
        '{}'::job_function[], true,
        crypt(${PIN}, gen_salt('bf', 8))
      )
      ON CONFLICT (username) DO UPDATE SET
        name          = EXCLUDED.name,
        role          = EXCLUDED.role,
        department    = EXCLUDED.department,
        job_functions = EXCLUDED.job_functions,
        is_active     = true,
        pin           = crypt(${PIN}, gen_salt('bf', 8)),
        failed_login_attempts = 0,
        locked_until  = NULL,
        updated_at    = now()
      RETURNING id, (xmax = 0) AS created
    `;

    console.log(
      `  ${user.created ? "+" : "~"} ${u.username.padEnd(14)} ${u.name.padEnd(22)} [${u.role}${u.department ? "/" + u.department : ""}]`
    );
  }

  await sql.end();
  console.log("\nDone. Login with any of the above usernames + PIN 1234.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
