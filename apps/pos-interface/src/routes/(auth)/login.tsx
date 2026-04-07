import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useAuth } from "@/context/auth";
import { Input } from "@repo/ui/input";
import { AlertCircle, LogIn } from "lucide-react";
import { db } from "@/lib/db";
import ErthLogoDark from "@/assets/erth-dark.svg";

const fallback = "/home" as const;

export const Route = createFileRoute("/(auth)/login")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(""),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect || fallback });
    }
  },
  component: LoginComponent,
  head: () => ({
    meta: [{ title: "Login" }],
  }),
});

type ShopUser = {
  id: string;
  username: string;
  name: string;
  role: string | null;
  department: string | null;
  brands: string[] | null;
};

function LoginComponent() {
  const auth = useAuth();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [shopUsers, setShopUsers] = React.useState<ShopUser[]>([]);

  const search = Route.useSearch();

  // Fetch users for quick login via public RPC (bypasses RLS)
  React.useEffect(() => {
    db.rpc("get_login_users").then(({ data }) => {
      if (data) {
        const eligible = (data as ShopUser[]).filter(
          (u) => u.department === "shop" || u.role === "super_admin"
        );
        setShopUsers(eligible);
      }
    });
  }, []);

  // Apply erth theme on login page
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("erth", "sakkba");
    root.classList.add("erth");
    return () => { root.classList.remove("erth"); };
  }, []);

  // Navigate after React has re-rendered with the new auth context
  React.useEffect(() => {
    if (auth.isAuthenticated) {
      router.invalidate().then(() => {
        navigate({ to: search.redirect || fallback });
      });
    }
  }, [auth.isAuthenticated]);

  const doLogin = async (username: string, pin: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await auth.login({ username, pin });
      // Navigation handled by useEffect after auth state propagates
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setIsSubmitting(false);
    }
  };

  const onFormSubmit = async (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    const data = new FormData(evt.currentTarget);
    const identifier = data.get("username")?.toString();
    const pin = data.get("pin")?.toString();
    if (!identifier || !pin) return;
    await doLogin(identifier, pin);
  };

  return (
    <div
      className="relative flex items-center justify-center min-h-screen overflow-hidden px-5 py-12"
      style={{
        background: "linear-gradient(160deg, #080d08 0%, #0f1a0f 40%, #0a120a 70%, #060906 100%)",
      }}
    >
      {/* Geometric weave pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(30deg, #d4cdaa 1px, transparent 1px),
            linear-gradient(150deg, #d4cdaa 1px, transparent 1px),
            linear-gradient(90deg, #d4cdaa 1px, transparent 1px)
          `,
          backgroundSize: "40px 70px, 40px 70px, 70px 40px",
        }}
      />

      {/* Corner accents */}
      <div className="absolute top-8 left-8 w-8 h-8 border-l border-t opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute top-8 right-8 w-8 h-8 border-r border-t opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute bottom-8 left-8 w-8 h-8 border-l border-b opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute bottom-8 right-8 w-8 h-8 border-r border-b opacity-10" style={{ borderColor: "#d4cdaa" }} />

      {/* Login panel */}
      <div className="relative z-10 w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center mb-5"
            style={{
              background: "linear-gradient(135deg, rgba(34,60,34,0.6), rgba(20,45,20,0.8))",
              border: "1px solid rgba(60,100,60,0.5)",
              boxShadow: "0 0 40px rgba(34,60,34,0.4)",
            }}
          >
            <img
              src={ErthLogoDark}
              alt="Autolinium"
              className="w-16 h-16 object-contain drop-shadow-[0_0_12px_rgba(212,205,170,0.4)]"
            />
          </div>
          <h1
            className="brand-font text-3xl capitalize"
            style={{ color: "#d4cdaa" }}
          >
            Autolinium
          </h1>
          <div
            className="h-px w-12 mt-3 mb-2"
            style={{ background: "linear-gradient(90deg, transparent, #d4cdaa40, transparent)" }}
          />
          <p
            className="text-xs tracking-[0.3em] uppercase"
            style={{ color: "#d4cdaa80", fontFamily: "'Montserrat', sans-serif" }}
          >
            Welcome back
          </p>
        </div>

        {/* Redirect alert */}
        {search.redirect && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg mb-5"
            style={{
              background: "rgba(212,205,170,0.08)",
              border: "1px solid rgba(212,205,170,0.15)",
            }}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#d4cdaaaa" }} />
            <span className="text-xs" style={{ color: "#d4cdaacc", fontFamily: "'Montserrat', sans-serif" }}>
              Please login to continue
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg mb-5"
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#f87171" }} />
            <span className="text-xs" style={{ color: "#fca5a5", fontFamily: "'Montserrat', sans-serif" }}>
              {error}
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={onFormSubmit}>
          <fieldset disabled={isSubmitting} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label
                htmlFor="username-input"
                className="text-xs font-medium tracking-[0.1em] uppercase"
                style={{ color: "#d4cdaa99", fontFamily: "'Montserrat', sans-serif" }}
              >
                Username
              </label>
              <Input
                id="username-input"
                name="username"
                placeholder="Enter your username"
                type="text"
                required
                className="h-11 bg-white/[0.06] border-white/[0.12] text-[#e8e2c4] placeholder:text-white/30 focus:border-[#d4cdaa60] focus:ring-[#d4cdaa30] rounded-lg"
              />
            </div>

            {/* PIN */}
            <div className="space-y-1.5">
              <label
                htmlFor="pin-input"
                className="text-xs font-medium tracking-[0.1em] uppercase"
                style={{ color: "#d4cdaa99", fontFamily: "'Montserrat', sans-serif" }}
              >
                PIN
              </label>
              <Input
                id="pin-input"
                name="pin"
                placeholder="••••"
                type="password"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                required
                className="h-11 bg-white/[0.06] border-white/[0.12] text-[#e8e2c4] placeholder:text-white/30 focus:border-[#d4cdaa60] focus:ring-[#d4cdaa30] rounded-lg"
              />
            </div>

            {/* Submit */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl text-sm tracking-[0.15em] uppercase font-medium transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, rgba(34,60,34,0.6), rgba(20,45,20,0.8))",
                  border: "1px solid rgba(60,100,60,0.5)",
                  color: "#d4cdaa",
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                <LogIn className="w-4 h-4" />
                {isSubmitting ? "Logging in..." : "Login"}
              </button>
            </div>
          </fieldset>
        </form>

        {/* Test Accounts */}
        {shopUsers.length > 0 && (
          <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(212,205,170,0.1)" }}>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
              style={{ color: "#d4cdaa40", fontFamily: "'Montserrat', sans-serif" }}
            >
              Quick Login (PIN: 1234)
            </p>
            <div className="space-y-1">
              {shopUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => doLogin(u.username, "1234")}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 group"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(212,205,170,0.08)";
                    e.currentTarget.style.borderColor = "rgba(212,205,170,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black"
                      style={{
                        background: "rgba(34,60,34,0.5)",
                        color: "#d4cdaa",
                      }}
                    >
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-semibold" style={{ color: "#d4cdaa" }}>
                        {u.name}
                      </p>
                      <p className="text-[10px]" style={{ color: "#d4cdaa50" }}>
                        @{u.username}{u.role ? ` · ${u.role.charAt(0).toUpperCase() + u.role.slice(1)}` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p
          className="text-center mt-8 text-xs tracking-[0.2em] uppercase"
          style={{ color: "#d4cdaa40", fontFamily: "'Montserrat', sans-serif" }}
        >
          &copy; {new Date().getFullYear()} Alpaca. All rights reserved.
        </p>
      </div>
    </div>
  );
}
