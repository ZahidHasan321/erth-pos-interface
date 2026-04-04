import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/auth";
import { WorkshopLayout } from "@/components/layout/WorkshopLayout";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { router } from "@/router";

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

  const handleLogout = () => {
    auth.logout().then(() => {
      router.invalidate().finally(() => {
        navigate({ to: "/login" });
      });
    });
  };

  return <WorkshopLayout onLogout={handleLogout} />;
}
