import { createFileRoute, redirect, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/context/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { canAccess, isAdmin } from "@/lib/rbac";

// Static prefixes → matrix keys. Longest prefix wins so "/orders/123" inherits
// "/orders". Everything under this pathless layout is admin-only.
function findMatrixKey(pathname: string): string {
  if (pathname === "/orders" || pathname.startsWith("/orders/")) return "/orders";
  if (pathname === "/garments" || pathname.startsWith("/garments/")) return "/garments";
  return "/";
}

export const Route = createFileRoute("/(main)")({
  beforeLoad: ({ context, location }) => {
    // 1. Must be authenticated.
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }

    const user = context.auth.user ?? null;
    if (!user) return;

    // 2. Admin gate. Non-admins can never reach any page in this app.
    const key = findMatrixKey(location.pathname);
    if (canAccess(user, key)) return;

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

  // Navigate to login after React flushes the auth-state update (avoids a
  // batching race where beforeLoad sees stale auth and loops).
  useEffect(() => {
    if (!auth.isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [auth.isAuthenticated]);

  const handleLogout = () => {
    auth.logout().catch(() => {});
  };

  // Defense in depth — the beforeLoad already gates, but never render the shell
  // for a non-admin even if state churns.
  if (!isAdmin(auth.user)) return null;

  return (
    <AppLayout onLogout={handleLogout}>
      <Outlet />
    </AppLayout>
  );
}
