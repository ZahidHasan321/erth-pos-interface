import { db } from "@/lib/db";
import type { UserSession } from "@repo/database";

const ONLINE_THRESHOLD_SECONDS = 90;

/** Upsert a heartbeat — one session per user, updates last_active_at */
export const upsertSession = async (
  userId: string,
  deviceInfo?: string
): Promise<void> => {
  const { error } = await db
    .from("user_sessions")
    .upsert(
      {
        user_id: userId,
        last_active_at: new Date().toISOString(),
        device_info: deviceInfo,
      },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`upsertSession: failed to upsert heartbeat for user ${userId}: ${error.message}`);
};

/** Remove session on logout */
export const endSession = async (userId: string): Promise<void> => {
  const { error } = await db
    .from("user_sessions")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(`endSession: failed to delete session for user ${userId}: ${error.message}`);
};

/** Get all sessions active within the threshold */
export const getActiveSessions = async (): Promise<UserSession[]> => {
  const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_SECONDS * 1000).toISOString();
  const { data, error } = await db
    .from("user_sessions")
    .select("*")
    .gte("last_active_at", cutoff);
  if (error) throw new Error(`getActiveSessions: failed to fetch active sessions: ${error.message}`);
  return data ?? [];
};
