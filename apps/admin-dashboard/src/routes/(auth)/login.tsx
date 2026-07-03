import { useState, useEffect } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/context/auth";
import { toast } from "sonner";
import { isAdmin, type AuthUser } from "@/lib/rbac";

// Post-login destination. Admins land on the dashboard; anyone else is bounced
// to access-denied (the RPCs would reject them server-side anyway).
function getPostLoginPath(user: AuthUser | null): string {
  return isAdmin(user) ? "/" : "/access-denied";
}

export const Route = createFileRoute("/(auth)/login")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      const dest = getPostLoginPath((context.auth as { user?: AuthUser | null }).user ?? null);
      throw redirect({ to: dest });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth.isAuthenticated) {
      const dest = getPostLoginPath(auth.user);
      router.invalidate().then(() => {
        router.navigate({ to: dest });
      });
    }
  }, [auth.isAuthenticated, auth.user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.login({ username, pin });
    } catch (err) {
      toast.error(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh grid place-items-center bg-[#0f0e0c] p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-md p-8">
        <div className="mb-6">
          <p className="text-xs font-medium text-primary mb-2" style={{ letterSpacing: "0.18em" }}>
            AUTHORIZED ACCESS
          </p>
          <h1 className="text-2xl font-semibold text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-brand oversight — owners only.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="ad-username">
              Username
            </label>
            <input
              id="ad-username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="enter username"
              required
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground outline-none focus:border-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="ad-pin">
              PIN
            </label>
            <input
              id="ad-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              required
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground outline-none focus:border-ring"
              style={{ letterSpacing: "0.2em" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
