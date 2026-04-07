import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useAuth } from "@/context/auth";
import { db } from "@/lib/db";
import SakkbaLogo from "@/assets/Sakkba.png";

const STAGES = ["New Order", "Home Delivery", "Brova Trial", "Alteration", "Collection"];
const TICKER = (STAGES.join("  ·  ") + "  ·  ").repeat(6);

export const Route = createFileRoute("/(auth)/sakkba/login")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(""),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect || "/sakkba" });
    }
  },
  component: SakkbaLoginPage,
  head: () => ({ meta: [{ title: "Sakkba — Sign In" }] }),
});

type ShopUser = {
  id: string;
  username: string;
  name: string;
  role: string | null;
  department: string | null;
  brands: string[] | null;
};

function SakkbaLoginPage() {
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
              u.brands?.includes("sakkba") &&
              (u.department === "shop" || u.role === "super_admin")
          )
        );
      }
    });
  }, []);

  React.useEffect(() => {
    if (auth.isAuthenticated) {
      router.invalidate().then(() => {
        navigate({ to: search.redirect || "/sakkba" });
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
        /* ── SAKKBA Login — Cool Light Theme ── */
        .sl {
          min-height: 100dvh;
          background: #f4f6fb;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }

        /* Subtle cool dot grid */
        .sl::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(26,37,71,0.04) 1px, transparent 1px);
          background-size: 24px 24px;
          pointer-events: none;
          z-index: 0;
        }

        .sl-body {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* ── LEFT PANEL ── */
        .sl-left {
          display: none;
          position: relative;
          padding: 44px 40px;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          background: #e8ecf6;
          border-right: 1px solid rgba(26,37,71,0.1);
        }

        @media (min-width: 800px) {
          .sl-body      { flex-direction: row; }
          .sl-left      { display: flex; width: 42%; flex-shrink: 0; }
          .sl-mob-logo  { display: none !important; }
        }

        /* Arabic ghost text — bleeds off bottom-left */
        .sl-ghost {
          position: absolute;
          bottom: -20px;
          left: -12px;
          font-family: 'Cairo', sans-serif;
          font-size: clamp(110px, 14vw, 200px);
          font-weight: 700;
          line-height: 0.85;
          color: rgba(26,37,71,0.05);
          user-select: none;
          pointer-events: none;
          letter-spacing: -0.02em;
          direction: rtl;
        }

        /* ── RIGHT PANEL ── */
        .sl-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 44px 28px;
        }

        .sl-form-wrap {
          width: 100%;
          max-width: 348px;
        }

        /* ── Entrance animations ── */
        @keyframes sl-rise {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes sl-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .sl-ready .sl-a1 { animation: sl-rise 0.6s cubic-bezier(0.22,1,0.36,1)   0ms  both; }
        .sl-ready .sl-a2 { animation: sl-rise 0.6s cubic-bezier(0.22,1,0.36,1)  90ms  both; }
        .sl-ready .sl-a3 { animation: sl-rise 0.6s cubic-bezier(0.22,1,0.36,1) 170ms  both; }
        .sl-ready .sl-a4 { animation: sl-rise 0.6s cubic-bezier(0.22,1,0.36,1) 250ms  both; }
        .sl-ready .sl-a5 { animation: sl-rise 0.6s cubic-bezier(0.22,1,0.36,1) 330ms  both; }
        .sl-ready .sl-a6 { animation: sl-fade 0.7s ease                         440ms both; }

        /* ── Inputs — underline only ── */
        .sl-label {
          display: block;
          font-family: 'Montserrat', sans-serif;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(17,24,39,0.45);
          margin-bottom: 7px;
        }
        .sl-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1.5px solid rgba(26,37,71,0.18);
          padding: 9px 0;
          font-family: 'Montserrat', sans-serif;
          font-size: 15px;
          font-weight: 500;
          color: #111827;
          outline: none;
          transition: border-color 0.2s ease;
        }
        .sl-input::placeholder { color: rgba(17,24,39,0.25); font-weight: 400; }
        .sl-input:focus         { border-bottom-color: #1a2547; }
        .sl-input[type="password"] {
          letter-spacing: 0.35em;
          font-size: 19px;
        }

        /* ── Submit button ── */
        .sl-btn {
          width: 100%;
          padding: 14px;
          background: #1a2547;
          border: none;
          border-radius: 0;
          color: #f4f6fb;
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .sl-btn:hover:not(:disabled) { background: #111b36; }
        .sl-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        /* ── Error ── */
        .sl-error {
          padding: 10px 14px;
          background: rgba(180,40,40,0.06);
          border-left: 2px solid rgba(180,40,40,0.4);
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          color: #8b2020;
          margin-bottom: 20px;
        }

        /* ── Quick-login pills ── */
        .sl-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 11px;
          border: 1px solid rgba(26,37,71,0.12);
          background: rgba(26,37,71,0.03);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          border-radius: 0;
          text-align: left;
          width: 100%;
        }
        .sl-pill:hover {
          border-color: rgba(26,37,71,0.28);
          background: rgba(26,37,71,0.07);
        }

        /* ── Ticker ── */
        .sl-ticker {
          position: relative;
          z-index: 1;
          border-top: 1px solid rgba(26,37,71,0.08);
          overflow: hidden;
          padding: 9px 0;
          background: rgba(26,37,71,0.025);
        }
        @keyframes sl-scroll {
          from { transform: translateX(0);    }
          to   { transform: translateX(-50%); }
        }
        .sl-ticker-inner {
          display: inline-block;
          white-space: nowrap;
          animation: sl-scroll 40s linear infinite;
          font-family: 'Montserrat', sans-serif;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(26,37,71,0.32);
        }

        @media (prefers-reduced-motion: reduce) {
          .sl-ready [class^="sl-a"] { animation: none !important; opacity: 1 !important; }
          .sl-ticker-inner           { animation: none !important; }
        }
      `}</style>

      <div className={`sl${ready ? " sl-ready" : ""}`}>
        <div className="sl-body">

          {/* ══ LEFT PANEL ══ */}
          <div className="sl-left">
            <div className="sl-ghost">سكبة</div>

            {/* Top: wordmark */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 52 }}>
                <div style={{
                  width: 34, height: 34,
                  background: "#1a2547",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <img src={SakkbaLogo} alt="Sakkba" style={{ width: 20, height: 20, objectFit: "contain", filter: "invert(1) brightness(0.85)" }} />
                </div>
                <div style={{ width: 1, height: 22, background: "rgba(26,37,71,0.25)", flexShrink: 0 }} />
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "rgba(17,24,39,0.4)",
                }}>Home Order System</span>
              </div>

              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 9, fontWeight: 700,
                letterSpacing: "0.3em", textTransform: "uppercase",
                color: "#1a2547", marginBottom: 16,
              }}>Home Order Management</p>

              <h1 style={{
                fontFamily: "'Marcellus', serif",
                fontSize: "clamp(46px, 5vw, 66px)",
                lineHeight: 1, letterSpacing: "-0.01em",
                color: "#111827", margin: 0,
              }}>Sakkba</h1>

              <div style={{
                width: 40, height: 2,
                background: "#1a2547",
                margin: "20px 0",
              }} />

              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 12, fontWeight: 400, lineHeight: 1.75,
                color: "rgba(17,24,39,0.48)",
                maxWidth: 230, margin: 0,
              }}>
                Fittings, deliveries, alterations —<br />managed from home.
              </p>
            </div>

            {/* Bottom: stage list */}
            <div style={{ borderTop: "1px solid rgba(17,24,39,0.1)", paddingTop: 22 }}>
              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 8, fontWeight: 700,
                letterSpacing: "0.22em", textTransform: "uppercase",
                color: "rgba(17,24,39,0.35)", marginBottom: 12,
              }}>Order Stages</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 14px" }}>
                {STAGES.map((s) => (
                  <span key={s} style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 9, fontWeight: 600,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "rgba(26,37,71,0.55)",
                  }}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ══ RIGHT PANEL ══ */}
          <div className="sl-right">
            <div className="sl-form-wrap">

              {/* Mobile wordmark */}
              <div className="sl-mob-logo" style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 36,
              }}>
                <div style={{
                  width: 30, height: 30, background: "#1a2547",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <img src={SakkbaLogo} alt="Sakkba" style={{ width: 18, height: 18, objectFit: "contain", filter: "invert(1) brightness(0.85)" }} />
                </div>
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "rgba(17,24,39,0.4)",
                }}>Sakkba</span>
              </div>

              {/* Heading */}
              <div className="sl-a1" style={{ marginBottom: 36 }}>
                <p style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.3em", textTransform: "uppercase",
                  color: "#1a2547", marginBottom: 10,
                }}>Authorized Access</p>
                <h2 style={{
                  fontFamily: "'Marcellus', serif",
                  fontSize: "clamp(36px, 5vw, 52px)",
                  lineHeight: 1, letterSpacing: "-0.01em",
                  color: "#111827", margin: 0,
                }}>Sign In</h2>
              </div>

              {error && <div className="sl-error sl-a1">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="sl-a2" style={{ marginBottom: 26 }}>
                  <label className="sl-label" htmlFor="sl-username">Username</label>
                  <input
                    id="sl-username"
                    className="sl-input"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="enter username"
                    required
                  />
                </div>

                <div className="sl-a3" style={{ marginBottom: 38 }}>
                  <label className="sl-label" htmlFor="sl-pin">PIN</label>
                  <input
                    id="sl-pin"
                    className="sl-input"
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

                <div className="sl-a4">
                  <button type="submit" className="sl-btn" disabled={loading}>
                    {loading ? "Signing in…" : "Sign In →"}
                  </button>
                </div>
              </form>

              {/* Quick login */}
              {users.length > 0 && (
                <div className="sl-a5" style={{ marginTop: 30 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(26,37,71,0.1)" }} />
                    <span style={{
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: 8, fontWeight: 700,
                      letterSpacing: "0.2em", textTransform: "uppercase",
                      color: "rgba(17,24,39,0.32)",
                      whiteSpace: "nowrap",
                    }}>Quick access · PIN 1234</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(26,37,71,0.1)" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    {users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="sl-pill"
                        disabled={loading}
                        onClick={() => doLogin(u.username, "1234")}
                      >
                        <span style={{
                          fontFamily: "'Montserrat', sans-serif",
                          fontSize: 11, fontWeight: 600,
                          color: "rgba(17,24,39,0.75)",
                        }}>{u.name.split(" ")[0]}</span>
                        <span style={{
                          fontFamily: "'Montserrat', sans-serif",
                          fontSize: 8, color: "rgba(17,24,39,0.38)",
                          textTransform: "capitalize",
                        }}>{u.role ?? u.department}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="sl-a6" style={{ marginTop: 40 }}>
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 8, fontWeight: 600,
                  letterSpacing: "0.15em", textTransform: "uppercase",
                  color: "rgba(17,24,39,0.25)",
                }}>&copy; {new Date().getFullYear()} Alpaca. All rights reserved.</span>
              </div>
            </div>
          </div>

        </div>

        {/* ══ TICKER ══ */}
        <div className="sl-ticker">
          <div className="sl-ticker-inner">{TICKER}</div>
        </div>
      </div>
    </>
  );
}
