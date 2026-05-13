import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useAuth } from "@/context/auth";
import { BRAND_NAMES } from "@/lib/constants";
import { Input } from "@repo/ui/input";
import { AlertCircle } from "lucide-react";
import { db } from "@/lib/db";
import ErthLogoDark from "@/assets/erth-dark.svg";
import SakkbaLogo from "@/assets/Sakkba.png";

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

const THEME = {
  erth: {
    bg: "#0e1a10",
    panel: "#142318",
    accent: "#3d6a47",
    watermark: ErthLogoDark,
    watermarkSize: 560,
    watermarkInvert: false,
    watermarkOpacity: 0.18,
  },
  sakkba: {
    bg: "#0e1228",
    panel: "#161c3a",
    accent: "#4a5a8a",
    watermark: SakkbaLogo,
    watermarkSize: 760,
    watermarkInvert: true,
    watermarkOpacity: 0.16,
  },
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
      : BRAND_NAMES.showroom;

  const [userType, setUserType] =
    React.useState<(typeof BRAND_NAMES)[keyof typeof BRAND_NAMES]>(initialUserType);

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

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("erth", "sakkba");
    root.classList.add(userType);
    return () => { root.classList.remove(userType); };
  }, [userType]);

  React.useEffect(() => {
    if (auth.isAuthenticated) {
      router.invalidate().then(() => {
        if (auth.user?.role === "cashier") {
          navigate({ to: "/cashier" });
          return;
        }
        if (userType === initialUserType && search.redirect) {
          navigate({ to: search.redirect });
        } else {
          navigate({ to: `/${userType}` });
        }
      });
    }
  }, [auth.isAuthenticated]);

  const doLogin = async (username: string, pin: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await auth.login({ username, pin });
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

  const filteredUsers = shopUsers.filter((u) => {
    if (!u.brands || u.brands.length === 0) return true;
    return u.brands.includes(userType);
  });

  const isErth = userType === BRAND_NAMES.showroom;
  const t = isErth ? THEME.erth : THEME.sakkba;

  return (
    <>
      <style>{`
        .lg {
          min-height: 100dvh;
          display: grid;
          grid-template-columns: 1fr;
          background: ${t.bg};
          color: #e8e2c4;
          transition: background 0.6s ease;
          position: relative;
          overflow: hidden;
        }
        @media (min-width: 960px) {
          .lg { grid-template-columns: 1.1fr 1fr; }
        }

        .lg-aside {
          display: none;
          position: relative;
          padding: 40px;
          overflow: hidden;
        }
        @media (min-width: 960px) {
          .lg-aside { display: flex; flex-direction: column; }
        }

        .lg-aside-top {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #d4cdaa;
        }
        .lg-aside-top img { height: 22px; opacity: 0.9; }
        .lg-aside-top .${""}wordmark {
          font-family: 'Marcellus', serif;
          font-size: 16px;
          letter-spacing: 0.02em;
        }

        .lg-watermark {
          position: absolute;
          width: ${t.watermarkSize}px;
          height: auto;
          bottom: -8%;
          right: -6%;
          opacity: ${t.watermarkOpacity};
          ${t.watermarkInvert ? "filter: brightness(0) invert(1);" : ""}
          user-select: none;
          pointer-events: none;
          transition: opacity 0.6s ease;
        }

        .lg-aside-bottom {
          position: relative;
          z-index: 2;
          margin-top: auto;
          max-width: 460px;
        }
        .lg-aside-bottom h2 {
          font-family: 'Marcellus', serif;
          font-size: 38px;
          line-height: 1.1;
          color: #e8e2c4;
          margin: 0 0 16px;
          letter-spacing: -0.015em;
        }
        .lg-aside-bottom h2 em {
          font-style: italic;
          color: #d4cdaa;
        }
        .lg-aside-bottom p {
          font-family: 'Montserrat', sans-serif;
          font-size: 13px;
          line-height: 1.7;
          color: rgba(232,226,196,0.55);
          margin: 0;
        }

        .lg-rule {
          width: 36px;
          height: 1px;
          background: rgba(212,205,170,0.4);
          margin: 0 0 20px;
        }

        .lg-form-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          background: ${t.panel};
          transition: background 0.6s ease;
        }
        @media (min-width: 960px) {
          .lg-form-wrap { padding: 56px 64px; }
        }

        .lg-form {
          width: 100%;
          max-width: 380px;
        }

        .lg-mobile-mark {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
          color: #d4cdaa;
        }
        .lg-mobile-mark img { height: 24px; }
        .lg-mobile-mark span {
          font-family: 'Marcellus', serif;
          font-size: 18px;
        }
        @media (min-width: 960px) {
          .lg-mobile-mark { display: none; }
        }

        .lg-eyebrow {
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          font-weight: 500;
          color: rgba(212,205,170,0.55);
          margin: 0 0 6px;
        }
        .lg-title {
          font-family: 'Marcellus', serif;
          font-size: 32px;
          line-height: 1.1;
          color: #e8e2c4;
          margin: 0 0 28px;
          letter-spacing: -0.01em;
        }
        .lg-title em {
          font-style: italic;
          color: #d4cdaa;
        }

        .lg-switch {
          display: inline-flex;
          padding: 3px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(212,205,170,0.12);
          border-radius: 999px;
          margin-bottom: 24px;
        }
        .lg-switch button {
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          font-weight: 500;
          padding: 7px 16px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(212,205,170,0.5);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          transition: color 0.2s, background 0.2s;
        }
        .lg-switch button.active {
          background: rgba(212,205,170,0.12);
          color: #e8e2c4;
        }
        .lg-switch button img { height: 14px; opacity: 0.85; }
        .lg-switch button .invert { filter: brightness(0) invert(1); }

        .lg-field { margin-bottom: 14px; }
        .lg-field label {
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: rgba(212,205,170,0.7);
          margin-bottom: 6px;
          display: block;
        }
        .lg-input {
          background: rgba(0,0,0,0.18) !important;
          border: 1px solid rgba(212,205,170,0.14) !important;
          color: #e8e2c4 !important;
          border-radius: 6px !important;
          height: 44px !important;
          font-family: 'Montserrat', sans-serif !important;
        }
        .lg-input::placeholder { color: rgba(212,205,170,0.3) !important; }
        .lg-input:focus {
          border-color: rgba(212,205,170,0.4) !important;
          outline: none;
        }

        .lg-submit {
          width: 100%;
          height: 46px;
          margin-top: 14px;
          background: #d4cdaa;
          color: ${t.bg};
          border: none;
          border-radius: 6px;
          font-family: 'Marcellus', serif;
          font-size: 16px;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .lg-submit:hover:not(:disabled) { background: #e0d8b4; }
        .lg-submit:disabled { opacity: 0.55; cursor: default; }
        .lg-submit .arrow {
          font-family: 'Montserrat', sans-serif;
          font-size: 16px;
        }

        .lg-alert {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 6px;
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          margin-bottom: 16px;
        }
        .lg-alert.info {
          background: rgba(212,205,170,0.06);
          border: 1px solid rgba(212,205,170,0.12);
          color: rgba(212,205,170,0.75);
        }
        .lg-alert.error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.22);
          color: #fca5a5;
        }

        .lg-quick {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid rgba(212,205,170,0.1);
        }
        .lg-quick-label {
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          font-weight: 500;
          color: rgba(212,205,170,0.45);
          margin: 0 0 10px;
          display: flex;
          justify-content: space-between;
        }
        .lg-quick-label .pin {
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.05em;
        }
        .lg-quick-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 240px;
          overflow-y: auto;
        }
        .lg-quick-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(212,205,170,0.07);
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
          text-align: left;
        }
        .lg-quick-item:hover {
          background: rgba(212,205,170,0.07);
          border-color: rgba(212,205,170,0.18);
        }
        .lg-quick-item:disabled { opacity: 0.5; cursor: default; }
        .lg-avatar {
          width: 28px; height: 28px;
          border-radius: 4px;
          background: rgba(212,205,170,0.12);
          color: #d4cdaa;
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          font-weight: 600;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .lg-avatar-info { min-width: 0; }
        .lg-avatar-info .nm {
          font-family: 'Montserrat', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #e8e2c4;
          line-height: 1.2;
        }
        .lg-avatar-info .sub {
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          color: rgba(212,205,170,0.45);
          line-height: 1.2;
          margin-top: 2px;
        }

        .lg-foot {
          margin-top: 32px;
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          color: rgba(212,205,170,0.35);
        }
      `}</style>

      <div className="lg">
        {/* Aside (desktop only) — brand storytelling panel */}
        <aside className="lg-aside">
          <div className="lg-aside-top">
            <img
              src={t.watermark}
              alt=""
              style={t.watermarkInvert ? { filter: "brightness(0) invert(1)" } : undefined}
            />
            <span className="wordmark">{isErth ? "Erth" : "Sakkba"}</span>
          </div>

          <img src={t.watermark} alt="" aria-hidden="true" className="lg-watermark" />

          <div className="lg-aside-bottom">
            <div className="lg-rule" />
            <h2>
              {isErth ? <>The <em>showroom</em>, in your hands.</> : <>The <em>home atelier</em>, in your hands.</>}
            </h2>
            <p>
              {isErth
                ? "Manage measurements, fittings, alterations and customer flow — from the floor of the Erth atelier in Kuwait."
                : "Home orders, deliveries and on-site fittings — orchestrate the Sakkba service from a single console."}
            </p>
          </div>
        </aside>

        {/* Form panel */}
        <div className="lg-form-wrap">
          <div className="lg-form">
            <div className="lg-mobile-mark">
              <img
                src={t.watermark}
                alt=""
                style={t.watermarkInvert ? { filter: "brightness(0) invert(1)" } : undefined}
              />
              <span>{isErth ? "Erth" : "Sakkba"}</span>
            </div>

            <p className="lg-eyebrow">Welcome back</p>
            <h1 className="lg-title">Sign in to <em>{isErth ? "Erth" : "Sakkba"}</em></h1>

            <div className="lg-switch" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={isErth}
                onClick={() => setUserType(BRAND_NAMES.showroom)}
                className={isErth ? "active" : ""}
              >
                <img src={ErthLogoDark} alt="" />
                Erth
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isErth}
                onClick={() => setUserType(BRAND_NAMES.fromHome)}
                className={!isErth ? "active" : ""}
              >
                <img src={SakkbaLogo} alt="" className="invert" />
                Sakkba
              </button>
            </div>

            {search.redirect && (
              <div className="lg-alert info">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Please sign in to continue</span>
              </div>
            )}
            {error && (
              <div className="lg-alert error">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={onFormSubmit}>
              <fieldset disabled={isSubmitting} style={{ border: "none", padding: 0, margin: 0 }}>
                <div className="lg-field">
                  <label htmlFor="username-input">Username</label>
                  <Input
                    id="username-input"
                    name="username"
                    placeholder="your.username"
                    type="text"
                    required
                    className="lg-input"
                  />
                </div>

                <div className="lg-field">
                  <label htmlFor="pin-input">PIN</label>
                  <Input
                    id="pin-input"
                    name="pin"
                    placeholder="••••"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    required
                    className="lg-input"
                  />
                </div>

                <button type="submit" disabled={isSubmitting} className="lg-submit">
                  {isSubmitting ? "Signing in…" : <>Sign in <span className="arrow">→</span></>}
                </button>
              </fieldset>
            </form>

            {filteredUsers.length > 0 && (
              <div className="lg-quick">
                <p className="lg-quick-label">
                  <span>Quick sign-in</span>
                  <span className="pin">PIN · 1234</span>
                </p>
                <div className="lg-quick-list">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => doLogin(u.username, "1234")}
                      className="lg-quick-item"
                    >
                      <div className="lg-avatar">{u.name.slice(0, 2).toUpperCase()}</div>
                      <div className="lg-avatar-info">
                        <div className="nm">{u.name}</div>
                        <div className="sub">
                          @{u.username}{u.role ? ` · ${u.role.charAt(0).toUpperCase() + u.role.slice(1)}` : ""}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="lg-foot">© {new Date().getFullYear()} Alpaca · Kuwait</p>
          </div>
        </div>
      </div>
    </>
  );
}
