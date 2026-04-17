import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@repo/ui/button";
import { ShieldAlert, LogOut, Home } from "lucide-react";
import { useAuth } from "@/context/auth";
import { getTerminalPath, isTerminalUser } from "@/lib/rbac";
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

  const homePath =
    isTerminalUser(auth.user) ? getTerminalPath(auth.user) ?? "/" : "/dashboard";

  const handleLogout = () => {
    auth.logout().finally(() => navigate({ to: "/login" }));
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-destructive/5 to-background p-4">
      <div className="max-w-2xl w-full bg-card border-2 border-destructive/20 rounded-2xl shadow-2xl p-6 text-center space-y-3">
        <div className="flex justify-center mb-3">
          <div className="bg-destructive/10 p-3 rounded-full">
            <ShieldAlert className="w-14 h-14 text-destructive" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>

        <p className="text-lg text-muted-foreground">
          You don't have permission to access{" "}
          <span className="font-semibold text-foreground font-mono">
            {attempted ?? "this page"}
          </span>
          .
        </p>

        <div className="pt-3 flex flex-col sm:flex-row gap-4 justify-center">
          <Link to={homePath}>
            <Button size="lg" className="w-full sm:w-auto">
              <Home className="w-4 h-4 mr-2" />
              Go to Home
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            onClick={handleLogout}
            className="w-full sm:w-auto"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
