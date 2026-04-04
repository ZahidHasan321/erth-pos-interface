import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { upsertSession, getActiveSessions } from "@/api/sessions";

const KEY = ["active-sessions"] as const;
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Fetch currently online users — polls every 30s */
export function useActiveSessions() {
  return useQuery({
    queryKey: KEY,
    queryFn: getActiveSessions,
    refetchInterval: HEARTBEAT_INTERVAL_MS,
    staleTime: HEARTBEAT_INTERVAL_MS,
  });
}

/** Returns a Set of user IDs that are currently online */
export function useOnlineUserIds() {
  const { data: sessions } = useActiveSessions();
  return new Set(sessions?.map((s) => s.user_id) ?? []);
}

function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobile/i.test(ua)) return "mobile";
  return "desktop";
}

/** Sends heartbeat every 30s while mounted. Call on login, stops on unmount. */
export function useHeartbeat(userId: string | null) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const device = getDeviceInfo();

    // Immediate first heartbeat
    upsertSession(userId, device).catch(() => {});

    intervalRef.current = setInterval(() => {
      upsertSession(userId, device).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId, qc]);
}
