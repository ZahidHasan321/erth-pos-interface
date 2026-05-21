/**
 * Non-destructive test for the login_with_pin RPC (migration 0014).
 *
 * Everything runs in ONE transaction that is ROLLED BACK at the end, so the
 * live DB is left exactly as found — no test user, no auth row persists.
 *
 * Usage: pnpm --filter @repo/database tsx scripts/test-login-rpc.ts
 */
import "dotenv/config";
import postgres from "postgres";
import fs from "fs";
import path from "path";

const c = postgres(process.env.DATABASE_URL!, { max: 1 });
const MIG = path.join(__dirname, "../migrations/0014_login_with_pin_rpc.sql");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`, extra ?? "");
  }
}

async function main() {
  await c.unsafe("BEGIN");
  try {
    // Apply the function definition under test.
    await c.unsafe(fs.readFileSync(MIG, "utf-8"));

    // Borrow valid enum values from an existing user so role/department casts.
    const [sample] = await c`SELECT role, department FROM public.users LIMIT 1`;
    const uname = `__test_login_${Date.now()}`;
    const pin = "4729";

    const [u] = await c`
      INSERT INTO public.users (username, name, role, department, is_active, pin, job_functions, brands)
      VALUES (${uname}, 'RPC Test', ${sample.role}, ${sample.department}, true,
              crypt(${pin}, gen_salt('bf')), '{}'::job_function[], ARRAY['ERTH'])
      RETURNING id`;
    const userId: string = u.id;

    // ---- 1. First login: creates the auth user ----
    const [r1] = await c`SELECT public.login_with_pin(${uname}, ${pin}) AS j`;
    const j1 = r1.j as { email: string; password: string; user: { id: string; brands: string[] } };
    check("returns @workshop.internal email", j1.email === `${uname}@workshop.internal`, j1.email);
    check("returns a fresh password", typeof j1.password === "string" && j1.password.length >= 32);
    check("returns matching user id", j1.user.id === userId);
    check("carries brands through", JSON.stringify(j1.user.brands) === JSON.stringify(["ERTH"]));

    const [au1] = await c`SELECT id, email, encrypted_password, email_confirmed_at, raw_app_meta_data
                          FROM auth.users WHERE email = ${j1.email}`;
    check("auth.users row created", !!au1);
    check("email_confirmed_at set (password grant works)", au1.email_confirmed_at !== null);
    check("app_metadata has provider=email", au1.raw_app_meta_data.provider === "email");
    check("app_metadata carries role", au1.raw_app_meta_data.role === sample.role);

    // The crux: the returned password must validate against encrypted_password
    // exactly as GoTrue's /token endpoint will check it.
    const [v1] = await c`SELECT (encrypted_password = crypt(${j1.password}, encrypted_password)) AS ok
                         FROM auth.users WHERE id = ${au1.id}`;
    check("returned password verifies against encrypted_password", v1.ok === true);

    const [id1] = await c`SELECT count(*)::int n FROM auth.identities
                          WHERE user_id = ${au1.id} AND provider = 'email'`;
    check("exactly one email identity", id1.n === 1, id1.n);

    const [lnk] = await c`SELECT auth_id FROM public.users WHERE id = ${userId}`;
    check("public.users.auth_id linked", lnk.auth_id === au1.id);

    // ---- 2. Second login: rotates password, no duplicate identity ----
    const [r2] = await c`SELECT public.login_with_pin(${uname}, ${pin}) AS j`;
    const j2 = r2.j as { password: string };
    check("password rotated on re-login", j2.password !== j1.password);
    const [v2] = await c`SELECT (encrypted_password = crypt(${j2.password}, encrypted_password)) AS ok
                         FROM auth.users WHERE id = ${au1.id}`;
    check("new password verifies", v2.ok === true);
    const [v2old] = await c`SELECT (encrypted_password = crypt(${j1.password}, encrypted_password)) AS ok
                            FROM auth.users WHERE id = ${au1.id}`;
    check("old password no longer valid", v2old.ok === false);
    const [id2] = await c`SELECT count(*)::int n FROM auth.identities
                          WHERE user_id = ${au1.id} AND provider = 'email'`;
    check("still exactly one email identity", id2.n === 1, id2.n);

    // ---- 3. Wrong PIN must raise (lockout/verify_pin path intact) ----
    let raised = false;
    try {
      await c`SELECT public.login_with_pin(${uname}, ${"0000"}) AS j`;
    } catch (e) {
      raised = /invalid pin/i.test((e as Error).message);
    }
    check("wrong PIN raises 'Invalid PIN'", raised);
  } finally {
    await c.unsafe("ROLLBACK");
    await c.end();
  }

  console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
