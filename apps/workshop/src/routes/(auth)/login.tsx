import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/(auth)/login")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: "/receiving" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.login({ username, password });
      navigate({ to: "/receiving" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl mx-auto mb-2">
            W
          </div>
          <CardTitle className="text-xl font-bold uppercase tracking-widest">Workshop</CardTitle>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Production Management</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          {/* Test credentials */}
          <div className="mt-4 pt-4 border-t">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-2">Test Accounts (pw: 123)</p>
            <div className="space-y-1">
              {[
                { user: "zahid", role: "Admin", dept: "Workshop" },
                { user: "fahad", role: "Manager", dept: "Workshop" },
                { user: "ahmed", role: "Staff", dept: "Shop" },
                { user: "khalid", role: "Staff", dept: "Shop" },
              ].map((a) => (
                <button
                  key={a.user}
                  type="button"
                  onClick={() => { setUsername(a.user); setPassword("123"); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors text-left"
                >
                  <span className="font-semibold">{a.user}</span>
                  <span className="text-muted-foreground/50">{a.role} · {a.dept}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
