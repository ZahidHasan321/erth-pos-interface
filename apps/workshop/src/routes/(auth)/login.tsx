import { useState, useEffect } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/context/auth";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/(auth)/login")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: "/receiving", search: { tab: undefined } });
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

  // Navigate after React has re-rendered with the new auth context
  useEffect(() => {
    if (auth.isAuthenticated) {
      router.invalidate().then(() => {
        router.navigate({ to: "/receiving", search: { tab: undefined } });
      });
    }
  }, [auth.isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.login({ username, pin });
      // Navigation handled by useEffect after auth state propagates
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
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
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                name="pin"
                autoComplete="off"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          {/* Test credentials */}
          <div className="mt-4 pt-4 border-t">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-2">Quick Login (PIN: 1234)</p>
            <div className="space-y-1">
              {[
                { user: "zahid", pin: "1234", role: "Super Admin", dept: "" },
                { user: "fahad", pin: "1234", role: "Manager", dept: "Workshop" },
                { user: "ahmed", pin: "1234", role: "Staff", dept: "Shop" },
                { user: "khalid", pin: "1234", role: "Staff", dept: "Shop" },
              ].map((a) => (
                <button
                  key={a.user}
                  type="button"
                  onClick={() => { setUsername(a.user); setPin(a.pin); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors text-left"
                >
                  <span className="font-semibold">{a.user}</span>
                  <span className="text-muted-foreground/50">{a.role}{a.dept ? ` · ${a.dept}` : ""}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
