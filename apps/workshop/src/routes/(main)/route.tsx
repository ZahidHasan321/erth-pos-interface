import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/auth";
import { WorkshopLayout } from "@/components/layout/WorkshopLayout";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useEffect } from "react";

export const Route = createFileRoute("/(main)")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
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

  return <WorkshopLayout onLogout={handleLogout} />;
}
