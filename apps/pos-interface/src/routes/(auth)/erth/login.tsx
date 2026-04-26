import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useAuth } from "@/context/auth";
import { db } from "@/lib/db";
import ErthLogo from "@/assets/erth-light.svg";

const STAGES = ["New Order", "Dispatch", "Brova Trial", "Alteration", "Collection"];

export const Route = createFileRoute("/(auth)/erth/login")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(""),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect || "/erth" });
    }
  },
  component: ErthLoginPage,
  head: () => ({ meta: [{ title: "Erth — Sign In" }] }),
});

type ShopUser = {
  id: string;
  username: string;
  name: string;
  role: string | null;
  department: string | null;
  brands: string[] | null;
};

function ErthLoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  const [username, setUsername] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<ShopUser[]>([]);
  const [ready, setReady] = React.useState(false);

  // Apply erth theme so CSS vars resolve correctly
  React.useEffect(() => {
    document.documentElement.classList.remove("erth", "sakkba");
    document.documentElement.classList.add("erth");
    return () => document.documentElement.classList.remove("erth");
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    db.rpc("get_login_users").then(({ data }) => {
      if (data) {
        setUsers(
          (data as ShopUser[]).filter(
            (u) =>
              u.brands?.includes("erth") &&
              (u.department === "shop" || u.role === "super_admin")
          )
        );
      }
    });
  }, []);

  React.useEffect(() => {
    if (auth.isAuthenticated) {
      router.invalidate().then(() => navigate({ to: search.redirect || "/erth" }));
    }
  }, [auth.isAuthenticated]);

  const doLogin = async (u: string, p: string) => {
    setLoading(true);
    setError(null);
    try {
      await auth.login({ username: u, pin: p });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .el-page {
          min-height: 100dvh;
          background-color: var(--background);
          background-image:
            linear-gradient(45deg, oklch(0.25 0.12 155 / 0.035) 1px, transparent 1px),
            linear-gradient(-45deg, oklch(0.25 0.12 155 / 0.035) 1px, transparent 1px);
          background-size: 28px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          gap: 16px;
        }

        /* Card: the hero — internal split layout */
        .el-card {
          width: 100%;
          max-width: 860px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: calc(var(--radius) * 2);
          box-shadow: 0 8px 32px oklch(0 0 0 / 0.07), 0 2px 8px oklch(0 0 0 / 0.04);
          display: flex;
          overflow: hidden;
          opacity: 0;
          transform: translateY(12px);
          transition: opacity 0.5s cubic-bezier(0.22,1,0.36,1), transform 0.5s cubic-bezier(0.22,1,0.36,1);
        }
        .el-card.ready {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── LEFT brand panel ── */
        .el-brand {
          display: none;
          position: relative;
          width: 38%;
          flex-shrink: 0;
          background: var(--primary);
          padding: 40px 36px;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }
        @media (min-width: 720px) {
          .el-brand { display: flex; }
        }

        /* Slow-drifting Arabic ghost */
        .el-ghost {
          position: absolute;
          bottom: -40px;
          right: -24px;
          font-family: 'Cairo', sans-serif;
          font-size: clamp(140px, 15vw, 210px);
          font-weight: 700;
          line-height: 0.9;
          color: oklch(1 0 0 / 0.06);
          user-select: none;
          pointer-events: none;
          direction: rtl;
          animation: el-ghost-breathe 9s ease-in-out infinite alternate;
        }
        @keyframes el-ghost-breathe {
          from { transform: translateY(0px); }
          to   { transform: translateY(-16px); }
        }

        /* ── RIGHT form panel ── */
        .el-form-panel {
          flex: 1;
          padding: 40px 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        @media (max-width: 719px) {
          .el-form-panel { padding: 32px 24px; }
        }

        /* Mobile-only brand strip (hidden on desktop where left brand panel shows) */
        .el-mobile-strip { display: none; }
        @media (max-width: 719px) {
          .el-mobile-strip { display: flex; }
        }

        /* Staggered item reveals */
        .el-item {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.45s cubic-bezier(0.22,1,0.36,1), transform 0.45s cubic-bezier(0.22,1,0.36,1);
        }
        .el-card.ready .el-item:nth-child(1) { transition-delay: 120ms; opacity: 1; transform: none; }
        .el-card.ready .el-item:nth-child(2) { transition-delay: 190ms; opacity: 1; transform: none; }
        .el-card.ready .el-item:nth-child(3) { transition-delay: 255ms; opacity: 1; transform: none; }
        .el-card.ready .el-item:nth-child(4) { transition-delay: 315ms; opacity: 1; transform: none; }
        .el-card.ready .el-item:nth-child(5) { transition-delay: 375ms; opacity: 1; transform: none; }
        .el-card.ready .el-item:nth-child(6) { transition-delay: 430ms; opacity: 1; transform: none; }

        /* Inputs — match app Shadcn style */
        .el-input {
          width: 100%;
          height: 40px;
          background: var(--card);
          border: 1px solid var(--input);
          border-radius: calc(var(--radius) - 2px);
          padding: 0 12px;
          font-family: 'Montserrat', sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: var(--card-foreground);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .el-input::placeholder { color: var(--muted-foreground); font-weight: 400; opacity: 0.7; }
        .el-input:focus {
          border-color: var(--ring);
          box-shadow: 0 0 0 3px oklch(0.35 0.10 155 / 0.12);
        }
        .el-input[type="password"] { letter-spacing: 0.2em; }

        /* Submit button — matches app primary button */
        .el-btn {
          width: 100%;
          height: 40px;
          background: var(--primary);
          color: var(--primary-foreground);
          border: none;
          border-radius: var(--radius);
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: opacity 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .el-btn:hover:not(:disabled) { opacity: 0.88; }
        .el-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Quick login pill — matches app ghost/outline button feel */
        .el-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 10px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: calc(var(--radius) - 2px);
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: background 0.12s, border-color 0.12s;
        }
        .el-pill:hover:not(:disabled) {
          background: var(--muted);
          border-color: var(--ring);
        }
        .el-pill:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Avatar circle */
        .el-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--primary);
          color: var(--primary-foreground);
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        /* Error banner */
        .el-error {
          padding: 10px 12px;
          background: oklch(0.58 0.22 25 / 0.08);
          border: 1px solid oklch(0.58 0.22 25 / 0.25);
          border-radius: calc(var(--radius) - 2px);
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          color: oklch(0.45 0.18 25);
        }

        .el-users-reveal {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.35s cubic-bezier(0.22,1,0.36,1);
        }
        .el-users-reveal.visible { grid-template-rows: 1fr; }
        .el-users-reveal > div { overflow: hidden; }

        @media (prefers-reduced-motion: reduce) {
          .el-card, .el-item, .el-ghost { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; }
          .el-users-reveal { transition: none !important; }
        }
      `}</style>

      <div className="el-page">

        <div className={`el-card${ready ? " ready" : ""}`}>

          {/* ══ LEFT — Brand panel ══ */}
          <div className="el-brand">
            <div className="el-ghost">أرث</div>

            {/* Top: logo + wordmark */}
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
                <img
                  src={ErthLogo}
                  alt="Erth"
                  style={{ height: 28, width: "auto", filter: "brightness(0) invert(1) opacity(0.9)" }}
                />
                <div style={{ width: 1, height: 18, background: "oklch(1 0 0 / 0.2)" }} />
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.2em",
                  textTransform: "uppercase", color: "oklch(1 0 0 / 0.5)",
                }}>Showroom</span>
              </div>

              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.28em",
                textTransform: "uppercase", color: "oklch(1 0 0 / 0.45)",
                marginBottom: 12,
              }}>Autolinium</p>

              <h1 style={{
                fontFamily: "'Marcellus', serif",
                fontSize: "clamp(44px, 4.5vw, 60px)",
                lineHeight: 1.05, letterSpacing: "-0.01em",
                color: "oklch(1 0 0 / 0.92)", margin: 0,
              }}>
                Erth<br />Show&shy;room
              </h1>

              <div style={{ width: 36, height: 2, background: "oklch(1 0 0 / 0.3)", margin: "20px 0" }} />

              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 12, lineHeight: 1.7, fontWeight: 400,
                color: "oklch(1 0 0 / 0.5)", maxWidth: 200,
              }}>
                Orders, fittings &<br />alterations — in one place.
              </p>
            </div>

            {/* Bottom: stages */}
            <div style={{
              position: "relative", zIndex: 1,
              borderTop: "1px solid oklch(1 0 0 / 0.1)", paddingTop: 20,
            }}>
              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 8, fontWeight: 700, letterSpacing: "0.22em",
                textTransform: "uppercase", color: "oklch(1 0 0 / 0.35)",
                marginBottom: 10,
              }}>Stages</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
                {STAGES.map((s) => (
                  <span key={s} style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: "oklch(1 0 0 / 0.5)",
                  }}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ══ RIGHT — Form panel ══ */}
          <div className="el-form-panel">

            {/* Mobile brand strip */}
            <div
              className="el-item el-mobile-strip"
              style={{ alignItems: "center", gap: 8, marginBottom: 28 }}
            >
              <img src={ErthLogo} alt="Erth" style={{ height: 22, filter: "var(--primary)" }} />
              <span style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
                textTransform: "uppercase", color: "var(--muted-foreground)",
              }}>Erth Showroom</span>
            </div>

            {/* Heading */}
            <div className="el-item" style={{ marginBottom: 28 }}>
              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.28em",
                textTransform: "uppercase", color: "var(--primary)",
                marginBottom: 8,
              }}>Welcome back</p>
              <h2 style={{
                fontFamily: "'Marcellus', serif",
                fontSize: "clamp(32px, 4vw, 44px)",
                lineHeight: 1.05, color: "var(--card-foreground)", margin: 0,
              }}>Sign In</h2>
            </div>

            {error && (
              <div className="el-item el-error" style={{ marginBottom: 16 }}>{error}</div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); doLogin(username, pin); }}>
              {/* Username */}
              <div className="el-item" style={{ marginBottom: 14 }}>
                <label style={{
                  display: "block",
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)",
                  marginBottom: 6,
                }}>Username</label>
                <input
                  className="el-input"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                />
              </div>

              {/* PIN */}
              <div className="el-item" style={{ marginBottom: 20 }}>
                <label style={{
                  display: "block",
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)",
                  marginBottom: 6,
                }}>PIN</label>
                <input
                  className="el-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  required
                />
              </div>

              <div className="el-item">
                <button type="submit" className="el-btn" disabled={loading}>
                  {loading ? "Signing in…" : "Sign In →"}
                </button>
              </div>
            </form>

            {/* Quick login */}
            <div className={`el-users-reveal${users.length > 0 ? " visible" : ""}`}>
              <div>
                <div className="el-item" style={{ marginTop: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    <span style={{
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
                      textTransform: "uppercase", color: "var(--muted-foreground)",
                      whiteSpace: "nowrap",
                    }}>Quick access · 1234</span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="el-pill"
                        disabled={loading}
                        onClick={() => doLogin(u.username, "1234")}
                      >
                        <div className="el-avatar">{u.name.slice(0, 2).toUpperCase()}</div>
                        <div>
                          <p style={{
                            fontFamily: "'Montserrat', sans-serif",
                            fontSize: 12, fontWeight: 600,
                            color: "var(--card-foreground)", margin: 0,
                          }}>{u.name.split(" ")[0]}</p>
                          <p style={{
                            fontFamily: "'Montserrat', sans-serif",
                            fontSize: 10, color: "var(--muted-foreground)",
                            margin: 0, textTransform: "capitalize",
                          }}>{u.role ?? u.department}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="el-item" style={{ marginTop: 28 }}>
              <span style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 10, color: "var(--muted-foreground)",
                letterSpacing: "0.08em",
              }}>&copy; {new Date().getFullYear()} Alpaca. All rights reserved.</span>
            </div>
          </div>

        </div>

        <Link
          to="/home"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 10, fontWeight: 600, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "oklch(0.40 0 0 / 0.38)",
            textDecoration: "none",
          }}
        >
          ← Back
        </Link>

      </div>
    </>
  );
}
