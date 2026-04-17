import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/auth";
import { WorkshopLayout } from "@/components/layout/WorkshopLayout";
import { TerminalLayout } from "@/components/layout/TerminalLayout";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  canAccess,
  getTerminalPath,
  isAdmin,
  isTerminalUser,
  PERMISSIONS,
} from "@/lib/rbac";
import { useEffect } from "react";

// Find the most specific matrix key that matches `pathname`. Matrix keys are
// static path prefixes (e.g. "/assigned", "/terminals/sewing"). A URL like
// "/assigned/abc-123/add-garment" inherits the "/assigned" entry.
// Longest prefix wins so "/terminals/sewing" beats a hypothetical "/terminals".
function findMatrixKey(pathname: string): string | null {
  const keys = Object.keys(PERMISSIONS)
    .filter((k) => pathname === k || pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length);
  return keys[0] ?? null;
}

export const Route = createFileRoute("/(main)")({
  beforeLoad: ({ context, location }) => {
    // 1. Must be authenticated.
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }

    const user = (context.auth as any).user ?? null;
    if (!user) return;

    // 2. Access-denied page itself is always reachable (can't trap the user
    //    there with a redirect loop if their terminal is unavailable too).
    if (location.pathname === "/access-denied") return;

    // 3. Find matrix entry + check.
    const matrixKey = findMatrixKey(location.pathname);
    const allowed = matrixKey
      ? canAccess(user, matrixKey)
      : isAdmin(user); // unknown page → admins only, everyone else denied

    if (allowed) return;

    // 4. Terminal-locked user on a forbidden page → send to own terminal.
    if (isTerminalUser(user)) {
      const own = getTerminalPath(user);
      if (own && own !== location.pathname) {
        throw redirect({ to: own as any });
      }
    }

    // 5. Office user denied → 403 page.
    throw redirect({
      to: "/access-denied",
      search: { attempted: location.pathname },
    });
  },
  component: MainRoute,
});

function MainRoute() {
  const auth = useAuth();
  const navigate = useNavigate();
  useRealtimeInvalidation();

  // Navigate to login after React has flushed the auth state update.
  // Doing this in an effect (rather than in the logout promise chain) avoids
  // a React 18 batching race where setUser(null) is queued but not yet applied
  // when router.invalidate() runs — causing beforeLoad to see stale auth and
  // loop the user back to the current page.
  useEffect(() => {
    if (!auth.isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [auth.isAuthenticated]);

  const handleLogout = () => {
    auth.logout().catch(() => {});
  };

  // Terminal-only users get the stripped-down fullscreen layout (no sidebar,
  // no brand nav). Office users keep the full WorkshopLayout.
  if (isTerminalUser(auth.user)) {
    return <TerminalLayout onLogout={handleLogout} />;
  }

  return <WorkshopLayout onLogout={handleLogout} />;
}
