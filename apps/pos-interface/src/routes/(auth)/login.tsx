import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useAuth } from "@/context/auth";
import { BRAND_NAMES } from "@/lib/constants";
import { Input } from "@repo/ui/input";
import { AlertCircle, LogIn } from "lucide-react";
import { db } from "@/lib/db";
import ErthLogoDark from "@/assets/erth-dark.svg";
import SakktbaLogo from "@/assets/Sakkba.png";

const fallback = "/" as const;

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

  const initialUserType: (typeof BRAND_NAMES)[keyof typeof BRAND_NAMES] =
    search.redirect?.startsWith(`/${BRAND_NAMES.fromHome}`)
      ? BRAND_NAMES.fromHome
      : search.redirect?.startsWith(`/${BRAND_NAMES.showroom}`)
        ? BRAND_NAMES.showroom
        : BRAND_NAMES.showroom;

  const [userType, setUserType] =
    React.useState<(typeof BRAND_NAMES)[keyof typeof BRAND_NAMES]>(initialUserType);

  // Fetch shop users for quick login
  React.useEffect(() => {
    db.from("users")
      .select("id, username, name, role, brands")
      .eq("department", "shop")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data) setShopUsers(data);
      });
  }, []);

  // Apply brand theme class so CSS variables resolve correctly
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("erth", "sakkba");
    root.classList.add(userType);
    return () => { root.classList.remove(userType); };
  }, [userType]);

  const doLogin = async (username: string, password: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await auth.login({ username, password, userType });
      await router.invalidate();

      if (userType === initialUserType && search.redirect) {
        await navigate({ to: search.redirect });
      } else {
        await navigate({ to: `/${userType}` });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onFormSubmit = async (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    const data = new FormData(evt.currentTarget);
    const identifier = data.get("username")?.toString();
    const password = data.get("password")?.toString();
    if (!identifier || !password) return;
    await doLogin(identifier, password);
  };

  // Filter test accounts to those that have access to the selected brand
  const filteredUsers = shopUsers.filter((u) => {
    if (!u.brands || u.brands.length === 0) return true;
    return u.brands.includes(userType);
  });

  const isErth = userType === BRAND_NAMES.showroom;

  return (
    <div
      className="relative flex items-center justify-center min-h-screen overflow-hidden px-5 py-12 transition-colors duration-700"
      style={{
        background: isErth
          ? "linear-gradient(160deg, #080d08 0%, #0f1a0f 40%, #0a120a 70%, #060906 100%)"
          : "linear-gradient(160deg, #080912 0%, #0f1220 40%, #0a0d18 70%, #060810 100%)",
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
            className="w-28 h-28 rounded-full flex items-center justify-center mb-5 transition-all duration-500"
            style={{
              background: isErth
                ? "linear-gradient(135deg, rgba(34,60,34,0.6), rgba(20,45,20,0.8))"
                : "linear-gradient(135deg, rgba(40,50,80,0.6), rgba(25,35,65,0.8))",
              border: isErth
                ? "1px solid rgba(60,100,60,0.5)"
                : "1px solid rgba(60,75,120,0.5)",
              boxShadow: isErth
                ? "0 0 40px rgba(34,60,34,0.4)"
                : "0 0 40px rgba(40,50,80,0.4)",
            }}
          >
            <img
              src={isErth ? ErthLogoDark : SakktbaLogo}
              alt={isErth ? "Erth" : "Sakkba"}
              className={`w-16 h-16 object-contain drop-shadow-[0_0_12px_rgba(212,205,170,0.4)] transition-all duration-500 ${!isErth ? "invert" : ""}`}
            />
          </div>
          <h1
            className="brand-font text-3xl capitalize transition-colors duration-500"
            style={{ color: "#d4cdaa" }}
          >
            {isErth ? "Erth" : "Sakkba"}
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

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password-input"
                className="text-xs font-medium tracking-[0.1em] uppercase"
                style={{ color: "#d4cdaa99", fontFamily: "'Montserrat', sans-serif" }}
              >
                Password
              </label>
              <Input
                id="password-input"
                name="password"
                placeholder="Enter your password"
                type="password"
                required
                className="h-11 bg-white/[0.06] border-white/[0.12] text-[#e8e2c4] placeholder:text-white/30 focus:border-[#d4cdaa60] focus:ring-[#d4cdaa30] rounded-lg"
              />
              <p className="text-xs" style={{ color: "#d4cdaa70", fontFamily: "'Montserrat', sans-serif" }}>
                Hint: password is 123
              </p>
            </div>

            {/* Brand Selection */}
            <div className="space-y-2 pt-1">
              <label
                className="text-xs font-medium tracking-[0.1em] uppercase"
                style={{ color: "#d4cdaa99", fontFamily: "'Montserrat', sans-serif" }}
              >
                Select Brand
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setUserType(BRAND_NAMES.showroom)}
                  className="relative flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all duration-300"
                  style={{
                    background: isErth
                      ? "linear-gradient(135deg, rgba(34,60,34,0.5), rgba(20,40,20,0.7))"
                      : "rgba(255,255,255,0.04)",
                    border: isErth
                      ? "1px solid rgba(60,100,60,0.5)"
                      : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <img src={ErthLogoDark} alt="Erth" className="h-5 w-auto" />
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color: isErth ? "#d4cdaa" : "#d4cdaa60",
                      fontFamily: "'Montserrat', sans-serif",
                    }}
                  >
                    Erth
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setUserType(BRAND_NAMES.fromHome)}
                  className="relative flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all duration-300"
                  style={{
                    background: !isErth
                      ? "linear-gradient(135deg, rgba(40,50,80,0.5), rgba(25,30,55,0.7))"
                      : "rgba(255,255,255,0.04)",
                    border: !isErth
                      ? "1px solid rgba(60,75,120,0.5)"
                      : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <img src={SakktbaLogo} alt="Sakkba" className="h-4 w-auto invert" />
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color: !isErth ? "#d4cdaa" : "#d4cdaa60",
                      fontFamily: "'Montserrat', sans-serif",
                    }}
                  >
                    Sakkba
                  </span>
                </button>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl text-sm tracking-[0.15em] uppercase font-medium transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: isErth
                    ? "linear-gradient(135deg, rgba(34,60,34,0.6), rgba(20,45,20,0.8))"
                    : "linear-gradient(135deg, rgba(40,50,80,0.6), rgba(25,35,65,0.8))",
                  border: isErth
                    ? "1px solid rgba(60,100,60,0.5)"
                    : "1px solid rgba(60,75,120,0.5)",
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
        {filteredUsers.length > 0 && (
          <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(212,205,170,0.1)" }}>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
              style={{ color: "#d4cdaa40", fontFamily: "'Montserrat', sans-serif" }}
            >
              Test Accounts (pw: 123)
            </p>
            <div className="space-y-1">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => doLogin(u.username, "123")}
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
                        background: isErth
                          ? "rgba(34,60,34,0.5)"
                          : "rgba(40,50,80,0.5)",
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
                  {u.brands && u.brands.length > 1 && (
                    <div className="flex gap-1">
                      {u.brands.map((b) => (
                        <span
                          key={b}
                          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                          style={{
                            background: b === userType ? "rgba(212,205,170,0.15)" : "rgba(255,255,255,0.05)",
                            color: b === userType ? "#d4cdaa" : "#d4cdaa40",
                          }}
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
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
          Secure tailoring management
        </p>
      </div>
    </div>
  );
}
