import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useAuth } from "@/context/auth";
import { db } from "@/lib/db";
import ErthLogo from "@/assets/erth-light.svg";

const STAGES = ["New Order", "Dispatch", "Brova Trial", "Alteration", "Collection"];
const TICKER = (STAGES.join("  ·  ") + "  ·  ").repeat(6);

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
      router.invalidate().then(() => {
        navigate({ to: search.redirect || "/erth" });
      });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(username, pin);
  };

  return (
    <>
      <style>{`
        /* ── ERTH Login — Warm Light Theme ── */
        .el {
          min-height: 100dvh;
          background: #f8f5ee;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }

        /* Subtle warm linen texture */
        .el::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(36,51,39,0.045) 1px, transparent 1px);
          background-size: 24px 24px;
          pointer-events: none;
          z-index: 0;
        }

        .el-body {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* ── LEFT PANEL ── */
        .el-left {
          display: none;
          position: relative;
          padding: 44px 40px;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          background: #ede9dc;
          border-right: 1px solid rgba(36,51,39,0.1);
        }

        @media (min-width: 800px) {
          .el-body      { flex-direction: row; }
          .el-left      { display: flex; width: 42%; flex-shrink: 0; }
          .el-mob-logo  { display: none !important; }
        }

        /* Arabic ghost text — bleeds off bottom-left */
        .el-ghost {
          position: absolute;
          bottom: -30px;
          left: -16px;
          font-family: 'Cairo', sans-serif;
          font-size: clamp(130px, 16vw, 220px);
          font-weight: 700;
          line-height: 0.85;
          color: rgba(36,51,39,0.055);
          user-select: none;
          pointer-events: none;
          letter-spacing: -0.02em;
          direction: rtl;
        }

        /* ── RIGHT PANEL ── */
        .el-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 44px 28px;
        }

        .el-form-wrap {
          width: 100%;
          max-width: 348px;
        }

        /* ── Entrance animations ── */
        @keyframes el-rise {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes el-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .el-ready .el-a1 { animation: el-rise 0.6s cubic-bezier(0.22,1,0.36,1)   0ms  both; }
        .el-ready .el-a2 { animation: el-rise 0.6s cubic-bezier(0.22,1,0.36,1)  90ms  both; }
        .el-ready .el-a3 { animation: el-rise 0.6s cubic-bezier(0.22,1,0.36,1) 170ms  both; }
        .el-ready .el-a4 { animation: el-rise 0.6s cubic-bezier(0.22,1,0.36,1) 250ms  both; }
        .el-ready .el-a5 { animation: el-rise 0.6s cubic-bezier(0.22,1,0.36,1) 330ms  both; }
        .el-ready .el-a6 { animation: el-fade 0.7s ease                         440ms both; }

        /* ── Inputs — underline only ── */
        .el-label {
          display: block;
          font-family: 'Montserrat', sans-serif;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(26,26,21,0.5);
          margin-bottom: 7px;
        }
        .el-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1.5px solid rgba(36,51,39,0.2);
          padding: 9px 0;
          font-family: 'Montserrat', sans-serif;
          font-size: 15px;
          font-weight: 500;
          color: #1a1a15;
          outline: none;
          transition: border-color 0.2s ease;
        }
        .el-input::placeholder { color: rgba(26,26,21,0.28); font-weight: 400; }
        .el-input:focus         { border-bottom-color: #243327; }
        .el-input[type="password"] {
          letter-spacing: 0.35em;
          font-size: 19px;
        }

        /* ── Submit button ── */
        .el-btn {
          width: 100%;
          padding: 14px;
          background: #243327;
          border: none;
          border-radius: 0;
          color: #f8f5ee;
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .el-btn:hover:not(:disabled) { background: #1a2720; }
        .el-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        /* ── Error ── */
        .el-error {
          padding: 10px 14px;
          background: rgba(180,40,40,0.07);
          border-left: 2px solid rgba(180,40,40,0.5);
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          color: #8b2020;
          margin-bottom: 20px;
        }

        /* ── Quick-login pills ── */
        .el-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 11px;
          border: 1px solid rgba(36,51,39,0.12);
          background: rgba(36,51,39,0.03);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          border-radius: 0;
          text-align: left;
          width: 100%;
        }
        .el-pill:hover {
          border-color: rgba(36,51,39,0.3);
          background: rgba(36,51,39,0.07);
        }

        /* ── Ticker ── */
        .el-ticker {
          position: relative;
          z-index: 1;
          border-top: 1px solid rgba(36,51,39,0.08);
          overflow: hidden;
          padding: 9px 0;
          background: rgba(36,51,39,0.03);
        }
        @keyframes el-scroll {
          from { transform: translateX(0);    }
          to   { transform: translateX(-50%); }
        }
        .el-ticker-inner {
          display: inline-block;
          white-space: nowrap;
          animation: el-scroll 40s linear infinite;
          font-family: 'Montserrat', sans-serif;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(36,51,39,0.35);
        }

        @media (prefers-reduced-motion: reduce) {
          .el-ready [class^="el-a"] { animation: none !important; opacity: 1 !important; }
          .el-ticker-inner           { animation: none !important; }
        }
      `}</style>

      <div className={`el${ready ? " el-ready" : ""}`}>
        <div className="el-body">

          {/* ══ LEFT PANEL ══ */}
          <div className="el-left">
            <div className="el-ghost">أرث</div>

            {/* Top: wordmark */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 52 }}>
                <div style={{
                  width: 34, height: 34,
                  background: "#243327",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <img src={ErthLogo} alt="Erth" style={{ width: 20, height: 20, objectFit: "contain", filter: "invert(1) brightness(0.85)" }} />
                </div>
                <div style={{ width: 1, height: 22, background: "rgba(36,51,39,0.3)", flexShrink: 0 }} />
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "rgba(26,26,21,0.45)",
                }}>Showroom System</span>
              </div>

              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 9, fontWeight: 700,
                letterSpacing: "0.3em", textTransform: "uppercase",
                color: "#243327", marginBottom: 16,
              }}>Showroom Management</p>

              <h1 style={{
                fontFamily: "'Marcellus', serif",
                fontSize: "clamp(46px, 5vw, 66px)",
                lineHeight: 1, letterSpacing: "-0.01em",
                color: "#1a1a15", margin: 0,
              }}>Show&shy;room</h1>

              <div style={{
                width: 40, height: 2,
                background: "#243327",
                margin: "20px 0",
              }} />

              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 12, fontWeight: 400, lineHeight: 1.75,
                color: "rgba(26,26,21,0.5)",
                maxWidth: 230, margin: 0,
              }}>
                Orders, fittings, alterations —<br />every stage, in one place.
              </p>
            </div>

            {/* Bottom: stage list */}
            <div style={{ borderTop: "1px solid rgba(26,26,21,0.1)", paddingTop: 22 }}>
              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 8, fontWeight: 700,
                letterSpacing: "0.22em", textTransform: "uppercase",
                color: "rgba(26,26,21,0.38)", marginBottom: 12,
              }}>Order Stages</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 14px" }}>
                {STAGES.map((s) => (
                  <span key={s} style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 9, fontWeight: 600,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "rgba(36,51,39,0.6)",
                  }}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ══ RIGHT PANEL ══ */}
          <div className="el-right">
            <div className="el-form-wrap">

              {/* Mobile wordmark */}
              <div className="el-mob-logo" style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 36,
              }}>
                <div style={{
                  width: 30, height: 30, background: "#243327",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <img src={ErthLogo} alt="Erth" style={{ width: 18, height: 18, objectFit: "contain", filter: "invert(1) brightness(0.85)" }} />
                </div>
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "rgba(26,26,21,0.45)",
                }}>Erth Showroom</span>
              </div>

              {/* Heading */}
              <div className="el-a1" style={{ marginBottom: 36 }}>
                <p style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.3em", textTransform: "uppercase",
                  color: "#243327", marginBottom: 10,
                }}>Authorized Access</p>
                <h2 style={{
                  fontFamily: "'Marcellus', serif",
                  fontSize: "clamp(36px, 5vw, 52px)",
                  lineHeight: 1, letterSpacing: "-0.01em",
                  color: "#1a1a15", margin: 0,
                }}>Sign In</h2>
              </div>

              {error && <div className="el-error el-a1">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="el-a2" style={{ marginBottom: 26 }}>
                  <label className="el-label" htmlFor="el-username">Username</label>
                  <input
                    id="el-username"
                    className="el-input"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="enter username"
                    required
                  />
                </div>

                <div className="el-a3" style={{ marginBottom: 38 }}>
                  <label className="el-label" htmlFor="el-pin">PIN</label>
                  <input
                    id="el-pin"
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

                <div className="el-a4">
                  <button type="submit" className="el-btn" disabled={loading}>
                    {loading ? "Signing in…" : "Sign In →"}
                  </button>
                </div>
              </form>

              {/* Quick login */}
              {users.length > 0 && (
                <div className="el-a5" style={{ marginTop: 30 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(36,51,39,0.12)" }} />
                    <span style={{
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: 8, fontWeight: 700,
                      letterSpacing: "0.2em", textTransform: "uppercase",
                      color: "rgba(26,26,21,0.35)",
                      whiteSpace: "nowrap",
                    }}>Quick access · PIN 1234</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(36,51,39,0.12)" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    {users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="el-pill"
                        disabled={loading}
                        onClick={() => doLogin(u.username, "1234")}
                      >
                        <span style={{
                          fontFamily: "'Montserrat', sans-serif",
                          fontSize: 11, fontWeight: 600,
                          color: "rgba(26,26,21,0.8)",
                        }}>{u.name.split(" ")[0]}</span>
                        <span style={{
                          fontFamily: "'Montserrat', sans-serif",
                          fontSize: 8, color: "rgba(26,26,21,0.4)",
                          textTransform: "capitalize",
                        }}>{u.role ?? u.department}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="el-a6" style={{ marginTop: 40 }}>
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 8, fontWeight: 600,
                  letterSpacing: "0.15em", textTransform: "uppercase",
                  color: "rgba(26,26,21,0.28)",
                }}>&copy; {new Date().getFullYear()} Alpaca. All rights reserved.</span>
              </div>
            </div>
          </div>

        </div>

        {/* ══ TICKER ══ */}
        <div className="el-ticker">
          <div className="el-ticker-inner">{TICKER}</div>
        </div>
      </div>
    </>
  );
}
