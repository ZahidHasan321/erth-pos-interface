import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

/**
 * POST /auth-admin
 * Headers: Authorization: Bearer <session_token>
 * Body: { action: "create-user" | "update-user" | "deactivate-user" | "activate-user" | "delete-user" | "set-pin", ...params }
 *
 * User management endpoint. Verifies caller has admin or manager role.
 * Managers are restricted to non-admin targets in their own department.
 */

// Role hierarchy: admins outrank managers outrank staff.
// deno-lint-ignore no-explicit-any
function isElevatedRole(role: any): boolean {
  return role === "admin" || role === "super_admin";
}

// job_function (person noun) → production_stage (verb noun).
// Mirrors apps/workshop/src/lib/job-functions.ts on the frontend.
const JOB_FUNCTION_TO_STAGE: Record<string, string> = {
  soaker: "soaking",
  cutter: "cutting",
  post_cutter: "post_cutting",
  sewer: "sewing",
  finisher: "finishing",
  ironer: "ironing",
  qc: "quality_check",
};

function jobFunctionToStage(job: string): string | null {
  return JOB_FUNCTION_TO_STAGE[job] ?? null;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

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

    // Check caller is admin or manager via users table. We need the caller's
    // own user_id too so handlers can reject self-targeted destructive ops.
    const { data: callerData } = await supabase
      .from("users")
      .select("id, role, department, is_active")
      .eq("auth_id", caller.id)
      .single();

    if (!callerData || !callerData.is_active) {
      return new Response(
        JSON.stringify({ error: "Caller account not found or deactivated" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isAdmin = ["admin", "super_admin"].includes(callerData.role);
    const isManager = callerData.role === "manager";

    if (!isAdmin && !isManager) {
      return new Response(
        JSON.stringify({ error: "Admin or manager access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ctx = {
      isAdmin,
      callerId: callerData.id as string,
      callerDepartment: isAdmin ? null : (callerData.department as string),
    };

    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case "create-user":
        return await handleCreateUser(supabase, params, ctx);
      case "update-user":
        return await handleUpdateUser(supabase, params, ctx);
      case "deactivate-user":
        return await handleDeactivateUser(supabase, params, ctx);
      case "activate-user":
        return await handleActivateUser(supabase, params, ctx);
      case "delete-user":
        return await handleDeleteUser(supabase, params, ctx);
      case "set-pin":
        return await handleSetPin(supabase, params, ctx);
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

type Ctx = {
  isAdmin: boolean;
  callerId: string;
  callerDepartment: string | null; // null when admin (no scope)
};

function jsonError(message: string, status = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleCreateUser(supabase: any, params: any, ctx: Ctx) {
  const { username, name, pin, role, department, job_functions, resources, ...rest } = params;

  if (!username || !name || !pin || !role || !department) {
    return jsonError("username, name, pin, role, and department are required");
  }

  // Manager guard: same dept, no admin promotion
  if (!ctx.isAdmin) {
    if (department !== ctx.callerDepartment) {
      return jsonError("Managers can only create users in their own department", 403);
    }
    if (isElevatedRole(role)) {
      return jsonError("Managers cannot create admin or super_admin users", 403);
    }
  }

  const jobFns: string[] = Array.isArray(job_functions) ? job_functions : [];
  const internalEmail = `${username}@workshop.internal`;
  const internalPassword = `internal_${crypto.randomUUID()}_${Date.now()}`;

  // 1. Create Supabase Auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: internalEmail,
    password: internalPassword,
    email_confirm: true,
    app_metadata: { role, department, job_functions: jobFns },
  });

  if (authError) {
    return jsonError(`Auth creation failed: ${authError.message}`);
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
      job_functions: jobFns,
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
    return jsonError(`User creation failed: ${insertError.message}`);
  }

  // 3. Set PIN (hashed server-side)
  const { error: pinError } = await supabase.rpc("set_user_pin", {
    p_user_id: userRow.id,
    p_pin: pin,
  });

  if (pinError) {
    // Rollback: delete users row + auth user
    await supabase.from("users").delete().eq("id", userRow.id);
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return jsonError(`PIN setup failed: ${pinError.message}`);
  }

  // 4. Optional: create production resource rows atomically. Terminal workers
  //    need one `resources` row per (user, responsibility) so the scheduler,
  //    team, and performance pages can attribute work to the right stage.
  //    Doing it here avoids a partial-failure window where a user exists
  //    without their resources.
  const resourceRows = Array.isArray(resources) ? resources : [];
  if (resourceRows.length > 0) {
    const inserts = resourceRows
      .filter((r: { responsibility?: string }) => r && r.responsibility)
      .map((r: { resource_name?: string; responsibility: string; unit_id?: string | null }) => ({
        user_id: userRow.id,
        resource_name: r.resource_name || name,
        responsibility: r.responsibility,
        unit_id: r.unit_id ?? null,
      }));

    if (inserts.length > 0) {
      const { error: resourceError } = await supabase.from("resources").insert(inserts);
      if (resourceError) {
        // Rollback: undo everything we just created
        await supabase.from("users").delete().eq("id", userRow.id);
        await supabase.auth.admin.deleteUser(authUser.user.id);
        return jsonError(`Resource creation failed: ${resourceError.message}`);
      }
    }
  }

  return new Response(
    JSON.stringify({ user: userRow }),
    { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Update an existing user. Sensitive columns (role/department/job_functions/
// is_active/brands/username) are only writable here; clients can't UPDATE
// them directly because of column-level grants. Username changes also sync
// the auth.users email so login keeps working.
// deno-lint-ignore no-explicit-any
async function handleUpdateUser(supabase: any, params: any, ctx: Ctx) {
  const { user_id, ...updates } = params;
  if (!user_id) return jsonError("user_id is required");

  // Load current row so we can do permission checks and detect what changed
  const { data: target, error: targetErr } = await supabase
    .from("users")
    .select("id, auth_id, username, name, role, department, job_functions, is_active")
    .eq("id", user_id)
    .single();

  if (targetErr || !target) return jsonError("User not found", 404);

  // Manager guards
  if (!ctx.isAdmin) {
    if (target.department !== ctx.callerDepartment) {
      return jsonError("Managers can only update users in their own department", 403);
    }
    if (isElevatedRole(target.role)) {
      return jsonError("Managers cannot modify admin or super_admin users", 403);
    }
    if ("role" in updates && isElevatedRole(updates.role)) {
      return jsonError("Managers cannot promote users to admin or super_admin", 403);
    }
    if ("department" in updates && updates.department !== ctx.callerDepartment) {
      return jsonError("Managers cannot move users to a different department", 403);
    }
  }

  // Build the update payload. Strip fields a client shouldn't be able to set.
  const allowed: Record<string, unknown> = {};
  const passthrough = [
    "username", "name", "email", "country_code", "phone",
    "role", "department", "job_functions", "brands", "is_active",
    "employee_id", "nationality", "hire_date", "notes",
  ];
  for (const k of passthrough) {
    if (k in updates) allowed[k] = updates[k];
  }
  allowed.updated_at = new Date().toISOString();

  const { data: userRow, error: updateErr } = await supabase
    .from("users")
    .update(allowed)
    .eq("id", user_id)
    .select()
    .single();

  if (updateErr) return jsonError(`Update failed: ${updateErr.message}`);

  // Sync auth.users when identifying or claim-affecting fields change.
  if (target.auth_id) {
    const usernameChanged = "username" in allowed && allowed.username !== target.username;
    const jobFunctionsChanged =
      "job_functions" in allowed &&
      !arraysEqual(
        Array.isArray(allowed.job_functions) ? (allowed.job_functions as string[]) : [],
        Array.isArray(target.job_functions) ? (target.job_functions as string[]) : [],
      );
    const claimChanged =
      ("role" in allowed && allowed.role !== target.role) ||
      ("department" in allowed && allowed.department !== target.department) ||
      jobFunctionsChanged;

    const authUpdate: Record<string, unknown> = {};
    if (usernameChanged) {
      authUpdate.email = `${allowed.username}@workshop.internal`;
    }
    if (claimChanged) {
      authUpdate.app_metadata = {
        user_id: target.id,
        role: userRow.role,
        department: userRow.department,
        job_functions: Array.isArray(userRow.job_functions) ? userRow.job_functions : [],
      };
    }
    if (Object.keys(authUpdate).length > 0) {
      const { error: authErr } = await supabase.auth.admin.updateUserById(
        target.auth_id,
        authUpdate,
      );
      if (authErr) {
        // Roll the users row back to keep auth and users in sync
        await supabase
          .from("users")
          .update({
            username: target.username,
            role: target.role,
            department: target.department,
            job_functions: target.job_functions,
          })
          .eq("id", user_id);
        return jsonError(`Auth sync failed: ${authErr.message}`);
      }
    }
  }

  // Sync resources rows to match job_functions. The scheduler, team, and
  // performance pages key on `resources.responsibility`, so each job a user
  // holds needs exactly one resource row (mapped from job_function to
  // production stage). Adds/removes are computed by diff. Historical KPI data
  // lives in garments.production_plan/worker_history keyed by username, so
  // dropping a resource row does not orphan past attribution.
  if ("job_functions" in allowed) {
    const desiredJobs: string[] = Array.isArray(allowed.job_functions)
      ? (allowed.job_functions as string[])
      : [];
    const desiredStages = new Set(desiredJobs.map(jobFunctionToStage).filter(Boolean));

    const { data: existing } = await supabase
      .from("resources")
      .select("id, responsibility")
      .eq("user_id", user_id);

    const existingByStage = new Map<string, string>();
    for (const r of (existing ?? []) as Array<{ id: string; responsibility: string | null }>) {
      if (r.responsibility) existingByStage.set(r.responsibility, r.id);
    }

    const stagesToAdd: string[] = [];
    for (const stage of desiredStages) {
      if (stage && !existingByStage.has(stage)) stagesToAdd.push(stage);
    }
    const idsToDelete: string[] = [];
    for (const [stage, id] of existingByStage) {
      if (!desiredStages.has(stage)) idsToDelete.push(id);
    }

    if (stagesToAdd.length > 0) {
      const inserts = stagesToAdd.map((stage) => ({
        user_id,
        resource_name: target.name,
        responsibility: stage,
        unit_id: null,
      }));
      const { error: addErr } = await supabase.from("resources").insert(inserts);
      if (addErr) return jsonError(`Adding resource rows failed: ${addErr.message}`);
    }
    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("resources")
        .delete()
        .in("id", idsToDelete);
      if (delErr) return jsonError(`Removing resource rows failed: ${delErr.message}`);
    }
  }

  return new Response(
    JSON.stringify({ user: userRow }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleDeactivateUser(supabase: any, params: any, ctx: Ctx) {
  const { user_id } = params;
  if (!user_id) return jsonError("user_id is required");

  // Self-deactivation would lock the caller out — no recovery.
  if (user_id === ctx.callerId) {
    return jsonError("You cannot deactivate your own account");
  }

  const { data: user } = await supabase
    .from("users")
    .select("auth_id, role, department")
    .eq("id", user_id)
    .single();

  if (!user) return jsonError("User not found", 404);

  if (!ctx.isAdmin) {
    if (user.department !== ctx.callerDepartment) {
      return jsonError("Managers can only manage users in their own department", 403);
    }
    if (isElevatedRole(user.role)) {
      return jsonError("Managers cannot deactivate admin or super_admin users", 403);
    }
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", user_id);

  if (updateErr) return jsonError(`Deactivate failed: ${updateErr.message}`);

  // Ban the Supabase Auth user (prevents JWT refresh)
  if (user.auth_id) {
    const { error: banErr } = await supabase.auth.admin.updateUserById(user.auth_id, {
      ban_duration: "876000h", // ~100 years
    });
    if (banErr) {
      // Roll the users row back so the DB and Auth state stay aligned.
      await supabase
        .from("users")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", user_id);
      return jsonError(`Auth ban failed: ${banErr.message}`);
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleActivateUser(supabase: any, params: any, ctx: Ctx) {
  const { user_id } = params;
  if (!user_id) return jsonError("user_id is required");

  const { data: user } = await supabase
    .from("users")
    .select("auth_id, role, department")
    .eq("id", user_id)
    .single();

  if (!user) return jsonError("User not found", 404);

  if (!ctx.isAdmin) {
    if (user.department !== ctx.callerDepartment) {
      return jsonError("Managers can only manage users in their own department", 403);
    }
    if (isElevatedRole(user.role)) {
      return jsonError("Managers cannot reactivate admin or super_admin users", 403);
    }
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", user_id);

  if (updateErr) return jsonError(`Activate failed: ${updateErr.message}`);

  // Unban the Supabase Auth user
  if (user.auth_id) {
    const { error: unbanErr } = await supabase.auth.admin.updateUserById(user.auth_id, {
      ban_duration: "none",
    });
    if (unbanErr) {
      await supabase
        .from("users")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", user_id);
      return jsonError(`Auth unban failed: ${unbanErr.message}`);
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Hard delete a user. Removes the users row + auth.users row + non-historical
// dependents (sessions, resources, notifications). FAILS if the user is
// referenced by anything that represents real activity (orders, garments,
// feedback, etc.) — those FKs default to NO ACTION, and we surface a clear
// "use deactivate instead" error rather than try to null them out.
// deno-lint-ignore no-explicit-any
async function handleDeleteUser(supabase: any, params: any, ctx: Ctx) {
  const { user_id } = params;
  if (!user_id) return jsonError("user_id is required");

  if (user_id === ctx.callerId) {
    return jsonError("You cannot delete your own account");
  }

  const { data: user } = await supabase
    .from("users")
    .select("auth_id, role, department")
    .eq("id", user_id)
    .single();

  if (!user) return jsonError("User not found", 404);

  if (!ctx.isAdmin) {
    if (user.department !== ctx.callerDepartment) {
      return jsonError("Managers can only manage users in their own department", 403);
    }
    if (isElevatedRole(user.role)) {
      return jsonError("Managers cannot delete admin or super_admin users", 403);
    }
  }

  // Clear non-historical dependents first so they don't trip the FK.
  // (notification_reads + notifications.recipient_user_id already CASCADE.)
  await supabase.from("user_sessions").delete().eq("user_id", user_id);
  await supabase.from("resources").delete().eq("user_id", user_id);

  const { error: deleteErr } = await supabase
    .from("users")
    .delete()
    .eq("id", user_id);

  if (deleteErr) {
    // 23503 = foreign_key_violation. Means this user is referenced by orders,
    // garments, feedback, etc. — historical activity we don't want to lose.
    if (deleteErr.code === "23503") {
      return jsonError(
        "This user has activity history (orders, feedback, or other records) and cannot be deleted. Deactivate the account instead — they won't be able to log in, but their history stays intact.",
        409,
      );
    }
    return jsonError(`Delete failed: ${deleteErr.message}`);
  }

  // Users row is gone — remove the auth account too. If this fails the auth
  // row is orphaned (no users row), which is harmless (login goes nowhere)
  // but worth surfacing so the operator can clean it up.
  if (user.auth_id) {
    const { error: authErr } = await supabase.auth.admin.deleteUser(user.auth_id);
    if (authErr) {
      return jsonError(
        `User row deleted, but auth account cleanup failed: ${authErr.message}`,
      );
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleSetPin(supabase: any, params: any, ctx: Ctx) {
  const { user_id, pin } = params;
  if (!user_id || !pin) return jsonError("user_id and pin are required");

  // Hierarchy guards apply only to managers acting on someone else.
  // (Setting your own PIN is always allowed.)
  if (!ctx.isAdmin && user_id !== ctx.callerId) {
    const { data: target } = await supabase
      .from("users")
      .select("role, department")
      .eq("id", user_id)
      .single();
    if (!target) return jsonError("User not found", 404);
    if (target.department !== ctx.callerDepartment) {
      return jsonError("Managers can only manage users in their own department", 403);
    }
    if (isElevatedRole(target.role)) {
      return jsonError("Managers cannot set the PIN of admin or super_admin users", 403);
    }
  }

  const { error } = await supabase.rpc("set_user_pin", {
    p_user_id: user_id,
    p_pin: pin,
  });

  if (error) return jsonError(error.message);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
