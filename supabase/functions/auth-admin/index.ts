import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

/**
 * POST /auth-admin
 * Headers: Authorization: Bearer <session_token>
 * Body: { action: "create-user" | "deactivate-user" | "activate-user" | "set-pin", ...params }
 *
 * Admin-only endpoint for user management.
 * Verifies caller is an admin before proceeding.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check caller is admin via their app_metadata or users table
    const { data: callerData } = await supabase
      .from("users")
      .select("role")
      .eq("auth_id", caller.id)
      .single();

    if (!callerData || callerData.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case "create-user":
        return await handleCreateUser(supabase, params);
      case "deactivate-user":
        return await handleDeactivateUser(supabase, params);
      case "activate-user":
        return await handleActivateUser(supabase, params);
      case "set-pin":
        return await handleSetPin(supabase, params);
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// deno-lint-ignore no-explicit-any
async function handleCreateUser(supabase: any, params: any) {
  const { username, name, pin, role, department, ...rest } = params;

  if (!username || !name || !pin || !role || !department) {
    return new Response(
      JSON.stringify({ error: "username, name, pin, role, and department are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const internalEmail = `${username}@workshop.internal`;
  const internalPassword = `internal_${crypto.randomUUID()}_${Date.now()}`;

  // 1. Create Supabase Auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: internalEmail,
    password: internalPassword,
    email_confirm: true,
    app_metadata: { role, department },
  });

  if (authError) {
    return new Response(
      JSON.stringify({ error: `Auth creation failed: ${authError.message}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Create users table row
  const { data: userRow, error: insertError } = await supabase
    .from("users")
    .insert({
      username,
      name,
      auth_id: authUser.user.id,
      role,
      department,
      email: rest.email || null,
      country_code: rest.country_code || "+965",
      phone: rest.phone || null,
      brands: rest.brands || null,
      is_active: true,
      employee_id: rest.employee_id || null,
      nationality: rest.nationality || null,
      hire_date: rest.hire_date || null,
      notes: rest.notes || null,
    })
    .select()
    .single();

  if (insertError) {
    // Rollback: delete the auth user we just created
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return new Response(
      JSON.stringify({ error: `User creation failed: ${insertError.message}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 3. Set PIN (hashed server-side)
  const { error: pinError } = await supabase.rpc("set_user_pin", {
    p_user_id: userRow.id,
    p_pin: pin,
  });

  if (pinError) {
    return new Response(
      JSON.stringify({ error: `PIN setup failed: ${pinError.message}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ user: userRow }),
    { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleDeactivateUser(supabase: any, params: any) {
  const { user_id } = params;
  if (!user_id) {
    return new Response(
      JSON.stringify({ error: "user_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get auth_id
  const { data: user } = await supabase
    .from("users")
    .select("auth_id")
    .eq("id", user_id)
    .single();

  // Deactivate in users table
  await supabase
    .from("users")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", user_id);

  // Ban the Supabase Auth user (prevents JWT refresh)
  if (user?.auth_id) {
    await supabase.auth.admin.updateUserById(user.auth_id, {
      ban_duration: "876000h", // ~100 years
    });
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleActivateUser(supabase: any, params: any) {
  const { user_id } = params;
  if (!user_id) {
    return new Response(
      JSON.stringify({ error: "user_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: user } = await supabase
    .from("users")
    .select("auth_id")
    .eq("id", user_id)
    .single();

  await supabase
    .from("users")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", user_id);

  // Unban the Supabase Auth user
  if (user?.auth_id) {
    await supabase.auth.admin.updateUserById(user.auth_id, {
      ban_duration: "none",
    });
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleSetPin(supabase: any, params: any) {
  const { user_id, pin } = params;
  if (!user_id || !pin) {
    return new Response(
      JSON.stringify({ error: "user_id and pin are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { error } = await supabase.rpc("set_user_pin", {
    p_user_id: user_id,
    p_pin: pin,
  });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
