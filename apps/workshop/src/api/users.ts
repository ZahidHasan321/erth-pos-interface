import { db } from "@/lib/db";
import type { User, NewUser } from "@repo/database";

export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await db
    .from("users")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const createUser = async (
  user: Omit<NewUser, "id" | "created_at" | "updated_at">
): Promise<User> => {
  const { data, error } = await db
    .from("users")
    .insert(user)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
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
  if (error) throw new Error(error.message);
  return data;
};

export const deactivateUser = async (id: string): Promise<void> => {
  const { error } = await db
    .from("users")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
};

export const activateUser = async (id: string): Promise<void> => {
  const { error } = await db
    .from("users")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
};
