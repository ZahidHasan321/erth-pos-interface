/**
 * END-TO-END login test against LIVE infra, exercising the exact path the
 * browser now uses: supabase-js .rpc('login_with_pin') over PostgREST (anon
 * key) then .auth.signInWithPassword() over GoTrue /auth/v1/token.
 *
 * Creates a clearly-marked throwaway user, runs the real flow, then HARD
 * DELETES the temp user + its auth.users/identities rows. Self-cleaning even
 * on failure.
 */
import "dotenv/config";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const DB = process.env.DATABASE_URL!;
const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

const sql = postgres(DB, { max: 1 });
const uname = `__e2e_login_${Date.now()}`;
const pin = "8137";
let userId: string | null = null;

async function cleanup() {
  if (!userId) return;
  await sql`DELETE FROM auth.identities WHERE user_id IN
            (SELECT auth_id FROM public.users WHERE id = ${userId})`;
  await sql`DELETE FROM auth.users WHERE id IN
            (SELECT auth_id FROM public.users WHERE id = ${userId})`;
  await sql`DELETE FROM public.users WHERE id = ${userId}`;
}

async function main() {
  if (!URL || !ANON) throw new Error("SUPABASE_URL / ANON key not in env");

  const [sample] = await sql`SELECT role, department FROM public.users LIMIT 1`;
  const [u] = await sql`
    INSERT INTO public.users (username, name, role, department, is_active, pin, job_functions, brands)
    VALUES (${uname}, 'E2E Test', ${sample.role}, ${sample.department}, true,
            crypt(${pin}, gen_salt('bf')), '{}'::job_function[], ARRAY['ERTH'])
    RETURNING id`;
  userId = u.id;
  console.log(`temp user ${uname} (${userId})`);

  // Exactly what auth.tsx now does, with the public anon client.
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rpcData, error: rpcError } = await client.rpc("login_with_pin", {
    p_username: uname,
    p_pin: pin,
  });
  if (rpcError) throw new Error(`rpc failed: ${rpcError.message}`);
  const creds = rpcData as { email: string; password: string; user: { id: string } };
  console.log(`  rpc OK → ${creds.email}, user ${creds.user.id}`);
  if (creds.user.id !== userId) throw new Error("user id mismatch");

  const { data: si, error: siErr } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (siErr || !si.session) throw new Error(`signIn failed: ${siErr?.message}`);
  console.log(`  signIn OK → access_token len ${si.session.access_token.length}`);

  // JWT must carry the app_metadata the app relies on.
  const claims = JSON.parse(
    Buffer.from(si.session.access_token.split(".")[1], "base64").toString()
  );
  const meta = claims.app_metadata ?? {};
  if (meta.user_id !== userId) throw new Error(`JWT app_metadata.user_id wrong: ${meta.user_id}`);
  if (meta.role !== sample.role) throw new Error(`JWT app_metadata.role wrong: ${meta.role}`);
  console.log(`  JWT app_metadata OK (user_id + role present)`);

  // Wrong PIN must still be rejected by the RPC.
  const { error: badErr } = await client.rpc("login_with_pin", {
    p_username: uname,
    p_pin: "0000",
  });
  if (!badErr || !/invalid pin/i.test(badErr.message))
    throw new Error(`wrong PIN not rejected: ${badErr?.message}`);
  console.log(`  wrong PIN rejected: "${badErr.message}"`);

  console.log("\nE2E PASS — full live login path works without the Edge Function.");
}

main()
  .then(cleanup)
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("\nE2E FAIL:", e.message);
    await cleanup().catch(() => {});
    await sql.end();
    process.exit(1);
  });
