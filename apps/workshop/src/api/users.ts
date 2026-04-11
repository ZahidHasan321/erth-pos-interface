import { db } from "@/lib/db";
import type { User, NewUser } from "@repo/database";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/** Helper to call admin Edge Function with the current session token */
async function callAuthAdmin(body: Record<string, unknown>) {
  const { data: { session } } = await db.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`callAuthAdmin (action=${body.action}): ${result.error || "request failed with no message"}`);
  return result;
}

export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await db
    .from("users")
    .select("*")
    .order("name");
  if (error) throw new Error(`getUsers: failed to fetch users: ${error.message}`);
  return data ?? [];
};

/** Create user via Edge Function (creates Supabase Auth account + users row + hashed PIN) */
export const createUser = async (
  user: Omit<NewUser, "id" | "created_at" | "updated_at"> & { pin?: string }
): Promise<User> => {
  const result = await callAuthAdmin({ action: "create-user", ...user });
  return result.user;
};

export const updateUser = async (
  id: string,
  updates: Partial<Omit<NewUser, "id" | "created_at">>
): Promise<User> => {
  const { data, error } = await db
    .from("users")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateUser: failed to update user ${id}: ${error.message}`);
  return data;
};

/** Deactivate via Edge Function (also bans Supabase Auth user) */
export const deactivateUser = async (id: string): Promise<void> => {
  await callAuthAdmin({ action: "deactivate-user", user_id: id });
};

/** Activate via Edge Function (also unbans Supabase Auth user) */
export const activateUser = async (id: string): Promise<void> => {
  await callAuthAdmin({ action: "activate-user", user_id: id });
};

/** Set a user's PIN via Edge Function (hashed server-side) */
export const setUserPin = async (userId: string, pin: string): Promise<void> => {
  await callAuthAdmin({ action: "set-pin", user_id: userId, pin });
};
