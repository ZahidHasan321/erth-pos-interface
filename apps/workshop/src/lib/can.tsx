import type { ReactNode } from "react";
import { useAuth } from "@/context/auth";
import { hasCapability, type Cap } from "@/lib/capabilities";

// One-line capability gate for the current user.
//
//   const canAdvance = useCan(CAPS.ADVANCE_STAGE);
//   <Button disabled={!canAdvance}>Done</Button>
export function useCan(cap: Cap): boolean {
  const { user } = useAuth();
  return hasCapability(user, cap);
}

// Render `children` only when the current user has `cap`; otherwise `fallback`.
//
//   <Can cap={CAPS.RECEIVE_AND_START}><Button>Receive & Start</Button></Can>
export function Can({
  cap,
  children,
  fallback = null,
}: {
  cap: Cap;
  children: ReactNode;
  fallback?: ReactNode;
}): ReactNode {
  return useCan(cap) ? children : fallback;
}
