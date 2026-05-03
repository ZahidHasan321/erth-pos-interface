import { useMemo } from "react";
import { useAuth } from "@/context/auth";
import { useResources } from "@/hooks/useResources";

/**
 * Returns the unit name the current user belongs to for a given responsibility.
 * Used to scope unit-collaborative terminals (sewing) — every member of the unit
 * sees the same garments. Returns null if user has no resource row for that
 * responsibility, or no unit assigned.
 */
export function useCurrentUserUnit(responsibility: string): string | null {
  const { user } = useAuth();
  const { data: resources = [] } = useResources();
  return useMemo(() => {
    if (!user) return null;
    const row = resources.find(
      (r) => r.user_id === user.id && r.responsibility === responsibility,
    );
    return row?.unit ?? null;
  }, [user, resources, responsibility]);
}
