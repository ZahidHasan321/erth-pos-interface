import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@repo/ui/button";
import { ShieldAlert, LogOut } from "lucide-react";
import { useAuth } from "@/context/auth";
import { z } from "zod";

const searchSchema = z.object({
  attempted: z.string().optional(),
});

export const Route = createFileRoute("/access-denied")({
  validateSearch: searchSchema,
  component: AccessDeniedPage,
  head: () => ({ meta: [{ title: "Access Denied" }] }),
});

function AccessDeniedPage() {
  const { attempted } = Route.useSearch();
  const auth = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.logout().finally(() => navigate({ to: "/login" }));
  };

  return (
    <div className="flex items-center justify-center min-h-dvh bg-background p-4">
      <div className="max-w-lg w-full bg-card border border-border rounded-md p-6 text-center space-y-3">
        <div className="flex justify-center mb-2">
          <div className="bg-[var(--status-bad-bg)] p-3 rounded-full">
            <ShieldAlert className="w-10 h-10 text-[var(--status-bad)]" />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-foreground">Access Denied</h1>

        <p className="text-sm text-muted-foreground">
          The admin dashboard is restricted to owners (admin / super-admin). Your
          account doesn't have access
          {attempted ? (
            <>
              {" "}to <span className="font-mono text-foreground">{attempted}</span>
            </>
          ) : null}
          .
        </p>

        <div className="pt-2 flex justify-center">
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
