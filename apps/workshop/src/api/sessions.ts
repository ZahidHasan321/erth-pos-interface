import { db } from "@/lib/db";
import type { UserSession } from "@repo/database";

const ONLINE_THRESHOLD_SECONDS = 90;

/** Upsert a heartbeat — one session per user, updates last_active_at */
export const upsertSession = async (
  userId: string,
  deviceInfo?: string
): Promise<void> => {
  // Try update first (most common path)
  const { data: existing } = await db
    .from("user_sessions")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (existing) {
    const { error } = await db
      .from("user_sessions")
      .update({ last_active_at: new Date().toISOString(), device_info: deviceInfo })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db
      .from("user_sessions")
      .insert({
        user_id: userId,
        last_active_at: new Date().toISOString(),
        device_info: deviceInfo,
      });
    if (error) throw new Error(error.message);
  }
};

/** Remove session on logout */
export const endSession = async (userId: string): Promise<void> => {
  const { error } = await db
    .from("user_sessions")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
};

/** Get all sessions active within the threshold */
export const getActiveSessions = async (): Promise<UserSession[]> => {
  const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_SECONDS * 1000).toISOString();
  const { data, error } = await db
    .from("user_sessions")
    .select("*")
    .gte("last_active_at", cutoff);
  if (error) throw new Error(error.message);
  return data ?? [];
};
