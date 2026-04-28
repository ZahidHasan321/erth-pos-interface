import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

/**
 * POST /auth-login
 * Body: { username: string, pin: string }
 *
 * 1. Calls verify_pin RPC (handles lockout, bcrypt comparison)
 * 2. Finds or creates a Supabase Auth user for JWT-based RLS
 * 3. Returns session tokens + user data
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, pin } = await req.json();
    if (!username || !pin) {
      return new Response(
        JSON.stringify({ error: "Username and PIN are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createAdminClient();

    // Step 1: Verify PIN (all security logic is in the DB function)
    const { data: userData, error: pinError } = await supabase.rpc("verify_pin", {
      p_username: username,
      p_pin: pin,
    });

    if (pinError) {
      return new Response(
        JSON.stringify({ error: pinError.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = String(userData.id); // ensure string for PostgREST .eq()
    const internalEmail = `${userData.username}@workshop.internal`;
    // Internal password — not user-facing, just for Supabase Auth session creation
    const internalPassword = `internal_${userId}_${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.slice(-12)}`;

    const appMetadata = {
      user_id: userId,
      role: userData.role,
      department: userData.department,
      job_functions: userData.job_functions ?? [],
    };

    // Step 2: Find or create Supabase Auth user
    // Check if auth user already linked (via auth_id on users table)
    const { data: userRow } = await supabase
      .from("users")
      .select("auth_id")
      .eq("id", userId)
      .single();

    let authUserId: string | null = userRow?.auth_id ?? null;

    if (!authUserId) {
      // Try to find existing auth user by email (may exist from a previous failed link)
      const { data: existingList } = await supabase.auth.admin.listUsers();
      const existingAuth = existingList?.users?.find((u) => u.email === internalEmail);

      if (existingAuth) {
        authUserId = existingAuth.id;
        // Update password + metadata
        await supabase.auth.admin.updateUserById(authUserId, {
          password: internalPassword,
          app_metadata: appMetadata,
        });
      } else {
        // Create new Supabase Auth user
        const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
          email: internalEmail,
          password: internalPassword,
          email_confirm: true,
          app_metadata: appMetadata,
        });

        if (createError) {
          throw new Error(`Failed to create auth account: ${createError.message}`);
        }
        authUserId = authUser.user.id;
      }

      // Link auth user to our users table via RPC (SECURITY DEFINER bypasses RLS)
      const { error: linkError } = await supabase.rpc("link_auth_id", {
        p_user_id: userId,
        p_auth_id: authUserId,
      });

      if (linkError) {
        console.error("Failed to link auth_id:", linkError.message);
      }
    } else {
      // Auth user exists — update password + metadata (role/department may have changed)
      await supabase.auth.admin.updateUserById(authUserId, {
        password: internalPassword,
        app_metadata: appMetadata,
      });
    }

    // Step 3: Sign in to get session tokens
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: internalEmail,
      password: internalPassword,
    });

    if (signInErr) {
      throw new Error(`Failed to create session: ${signInErr.message}`);
    }

    return new Response(
      JSON.stringify({
        session: signInData.session,
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
