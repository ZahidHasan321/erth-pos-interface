/**
 * Seed one dummy terminal user per production stage (+ a matching resources
 * row so scheduler / PlanDialog can pick them). PIN is 1234 for every account.
 *
 * Idempotent — safe to re-run. Updates existing rows on username conflict.
 *
 * Auth bootstrap: we only touch public.users and resources. The auth.users
 * row is created lazily on first login by the auth-login edge function
 * (see supabase/functions/auth-login/index.ts).
 *
 * Run: pnpm --filter @repo/database db:seed-terminal-users
 */

import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

type Seed = {
  username: string;
  name: string;
  job_function:
    | "soaker" | "cutter" | "post_cutter" | "sewer"
    | "finisher" | "ironer" | "qc";
  stage:
    | "soaking" | "cutting" | "post_cutting" | "sewing"
    | "finishing" | "ironing" | "quality_check";
};

const USERS: Seed[] = [
  { username: "soaker",      name: "Test Soaker",      job_function: "soaker",      stage: "soaking" },
  { username: "cutter",      name: "Test Cutter",      job_function: "cutter",      stage: "cutting" },
  { username: "post_cutter", name: "Test Post-Cutter", job_function: "post_cutter", stage: "post_cutting" },
  { username: "sewer",       name: "Test Sewer",       job_function: "sewer",       stage: "sewing" },
  { username: "finisher",    name: "Test Finisher",    job_function: "finisher",    stage: "finishing" },
  { username: "ironer",      name: "Test Ironer",      job_function: "ironer",      stage: "ironing" },
  { username: "qc",          name: "Test QC",          job_function: "qc",          stage: "quality_check" },
];

const PIN = "1234";

async function main() {
  console.log(`\nSeeding ${USERS.length} terminal users (PIN=${PIN})...`);

  for (const u of USERS) {
    const [user] = await sql<{ id: string; created: boolean }[]>`
      INSERT INTO users (username, name, role, department, job_function, is_active, pin)
      VALUES (
        ${u.username}, ${u.name}, 'staff', 'workshop',
        ${u.job_function}::job_function, true,
        crypt(${PIN}, gen_salt('bf', 8))
      )
      ON CONFLICT (username) DO UPDATE SET
        name         = EXCLUDED.name,
        role         = EXCLUDED.role,
        department   = EXCLUDED.department,
        job_function = EXCLUDED.job_function,
        is_active    = true,
        pin          = crypt(${PIN}, gen_salt('bf', 8)),
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at   = now()
      RETURNING id, (xmax = 0) AS created
    `;

    // Ensure a resources row exists for this user so they show up in
    // PlanDialog worker pickers. Keyed on user_id + responsibility to stay
    // idempotent without a DB-level unique constraint.
    await sql`
      INSERT INTO resources (user_id, resource_name, responsibility, resource_type)
      SELECT ${user.id}::uuid, ${u.name}, ${u.stage}, 'worker'
      WHERE NOT EXISTS (
        SELECT 1 FROM resources
        WHERE user_id = ${user.id}::uuid AND responsibility = ${u.stage}
      )
    `;

    // Refresh resource_name if the user's name was updated this run.
    await sql`
      UPDATE resources
      SET resource_name = ${u.name}
      WHERE user_id = ${user.id}::uuid
        AND responsibility = ${u.stage}
        AND resource_name IS DISTINCT FROM ${u.name}
    `;

    console.log(
      `  ${user.created ? "+" : "~"} ${u.username.padEnd(12)} ${u.name.padEnd(22)} [${u.job_function}]`
    );
  }

  await sql.end();
  console.log("\nDone. Login with any of the above usernames + PIN 1234.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
