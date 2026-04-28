import { db } from "@/lib/db";
import type { User, NewUser } from "@repo/database";

/** Helper to call admin Edge Function. supabase-js auto-sends apikey + the
 *  current session bearer, so RLS and JWT checks both see the caller. */
async function callAuthAdmin(body: Record<string, unknown>) {
  const { data, error } = await db.functions.invoke("auth-admin", { body });
  if (error) {
    let serverMsg: string | null = null;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = await ctx.json();
        serverMsg = parsed?.error ?? null;
      } catch { /* ignore */ }
    }
    throw new Error(`callAuthAdmin (action=${body.action}): ${serverMsg || error.message || "request failed with no message"}`);
  }
  return data;
}

// Explicit column list — `pin`, `failed_login_attempts`, `locked_until` are
// service_role-only and would error a SELECT *.
const USER_COLUMNS =
  "id, auth_id, username, name, email, country_code, phone, role, department, job_functions, brands, is_active, employee_id, nationality, hire_date, notes, created_at, updated_at";

export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await db
    .from("users")
    .select(USER_COLUMNS)
    .order("name");
  if (error) throw new Error(`getUsers: failed to fetch users: ${error.message}`);
  return (data ?? []) as User[];
};

/** Create user via Edge Function (creates Supabase Auth account + users row +
 *  hashed PIN, and optionally a `resources` row for terminal workers, all
 *  rolled back together if any step fails). */
export const createUser = async (
  user: Omit<NewUser, "id" | "created_at" | "updated_at"> & {
    pin?: string;
    resources?: Array<{ resource_name?: string; responsibility: string; unit_id?: string | null }>;
  }
): Promise<User> => {
  const result = await callAuthAdmin({ action: "create-user", ...user });
  return result.user;
};

/** Update user via Edge Function. Sensitive columns (role/department/
 *  job_function/is_active/brands/username) are not writable by clients
 *  directly — column grants block them. The Edge Function also keeps the
 *  Supabase Auth user (email + app_metadata) in sync. */
export const updateUser = async (
  id: string,
  updates: Partial<Omit<NewUser, "id" | "created_at">>
): Promise<User> => {
  const result = await callAuthAdmin({ action: "update-user", user_id: id, ...updates });
  return result.user;
};

/** Deactivate via Edge Function (also bans Supabase Auth user) */
export const deactivateUser = async (id: string): Promise<void> => {
  await callAuthAdmin({ action: "deactivate-user", user_id: id });
};

/** Activate via Edge Function (also unbans Supabase Auth user) */
export const activateUser = async (id: string): Promise<void> => {
  await callAuthAdmin({ action: "activate-user", user_id: id });
};

/** Hard delete via Edge Function. Removes users row + auth.users + sessions
 *  + resources. Fails (409) if the user is referenced by historical data
 *  (orders, feedback, etc.) — caller should suggest deactivate instead. */
export const deleteUser = async (id: string): Promise<void> => {
  await callAuthAdmin({ action: "delete-user", user_id: id });
};

/** Set a user's PIN via Edge Function (hashed server-side) */
export const setUserPin = async (userId: string, pin: string): Promise<void> => {
  await callAuthAdmin({ action: "set-pin", user_id: userId, pin });
};
