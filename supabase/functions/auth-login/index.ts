import { corsHeaders } from "../_shared/cors.ts";

/**
 * POST /auth-login
 * Body: { username: string, pin: string }
 *
 * Implemented with raw fetch (no supabase-js) so the isolate has zero
 * remote imports to resolve at boot. Boot-time remote-fetch was causing
 * ~30% of cold isolates to fail their TLS handshake and drop the request.
 *
 * 1. POST /rest/v1/rpc/verify_pin   — PIN check, lockout, returns user
 * 2. Ensure a Supabase Auth user exists / is linked (admin API)
 * 3. POST /auth/v1/token?grant_type=password — issue session JWT
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function adminHeaders() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function readJson(r: Response): Promise<unknown> {
  const txt = await r.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return txt; }
}

function errResp(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, pin } = await req.json();
    if (!username || !pin) {
      return errResp("Username and PIN are required", 400);
    }

    // Step 1: Verify PIN via RPC (DB function handles lockout & bcrypt)
    const pinRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_pin`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ p_username: username, p_pin: pin }),
    });
    const pinBody = await readJson(pinRes);
    if (!pinRes.ok) {
      const msg = (pinBody as { message?: string } | null)?.message ?? "PIN verification failed";
      return errResp(msg, 401);
    }
    const userData = pinBody as {
      id: string;
      username: string;
      name: string;
      role: string;
      department: string | null;
      job_functions: string[];
      brands: string[] | null;
    };

    const userId = String(userData.id);
    const internalEmail = `${userData.username}@workshop.internal`;
    const internalPassword = `internal_${userId}_${SERVICE_ROLE_KEY.slice(-12)}`;

    const appMetadata = {
      user_id: userId,
      role: userData.role,
      department: userData.department,
      job_functions: userData.job_functions ?? [],
    };

    // Step 2: Find or create the linked Supabase Auth user
    const rowRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=auth_id`,
      { headers: { ...adminHeaders(), Accept: "application/json" } }
    );
    const rowBody = (await readJson(rowRes)) as Array<{ auth_id: string | null }> | null;
    let authUserId: string | null = rowBody?.[0]?.auth_id ?? null;

    if (!authUserId) {
      // Look for an existing auth user by email (recover from a half-linked state)
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
        { headers: adminHeaders() }
      );
      const list = (await readJson(listRes)) as { users?: Array<{ id: string; email: string }> } | null;
      const existing = list?.users?.find((u) => u.email === internalEmail);

      if (existing) {
        authUserId = existing.id;
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
          method: "PUT",
          headers: adminHeaders(),
          body: JSON.stringify({
            password: internalPassword,
            app_metadata: appMetadata,
          }),
        });
      } else {
        const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({
            email: internalEmail,
            password: internalPassword,
            email_confirm: true,
            app_metadata: appMetadata,
          }),
        });
        const createBody = (await readJson(createRes)) as { id?: string; msg?: string; message?: string } | null;
        if (!createRes.ok || !createBody?.id) {
          throw new Error(`Failed to create auth account: ${createBody?.msg ?? createBody?.message ?? createRes.status}`);
        }
        authUserId = createBody.id;
      }

      // Link auth_id back to public.users via SECURITY DEFINER RPC
      const linkRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/link_auth_id`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ p_user_id: userId, p_auth_id: authUserId }),
      });
      if (!linkRes.ok) {
        const linkErr = await readJson(linkRes);
        console.error("Failed to link auth_id:", linkErr);
      }
    } else {
      // Auth user already linked — sync password + metadata (role/dept may have changed)
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
        method: "PUT",
        headers: adminHeaders(),
        body: JSON.stringify({
          password: internalPassword,
          app_metadata: appMetadata,
        }),
      });
    }

    // Step 3: Sign in to get session tokens (anon key — this is the user-facing token endpoint)
    const signInRes = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: internalEmail, password: internalPassword }),
      }
    );
    const signInBody = (await readJson(signInRes)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      expires_at?: number;
      token_type?: string;
      user?: unknown;
      msg?: string;
      error_description?: string;
    } | null;
    if (!signInRes.ok || !signInBody?.access_token) {
      throw new Error(
        `Failed to create session: ${signInBody?.error_description ?? signInBody?.msg ?? signInRes.status}`
      );
    }

    return new Response(
      JSON.stringify({
        session: {
          access_token: signInBody.access_token,
          refresh_token: signInBody.refresh_token,
          expires_in: signInBody.expires_in,
          expires_at: signInBody.expires_at,
          token_type: signInBody.token_type,
          user: signInBody.user,
        },
        user: {
          id: userId,
          username: userData.username,
          name: userData.name,
          role: userData.role,
          department: userData.department,
          job_functions: userData.job_functions ?? [],
          brands: userData.brands ?? [],
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
