import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useAuth } from "@/context/auth";
import { db } from "@/lib/db";
import SakkbaLogo from "@/assets/Sakkba.png";

const STAGES = ["New Order", "Home Delivery", "Brova Trial", "Alteration", "Collection"];

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

  // Apply sakkba theme so CSS vars resolve correctly
  React.useEffect(() => {
    document.documentElement.classList.remove("erth", "sakkba");
    document.documentElement.classList.add("sakkba");
    return () => document.documentElement.classList.remove("sakkba");
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
              u.brands?.includes("sakkba") &&
              (u.department === "shop" || u.role === "super_admin")
          )
        );
      }
    });
  }, []);

  React.useEffect(() => {
    if (auth.isAuthenticated) {
      router.invalidate().then(() => navigate({ to: search.redirect || "/sakkba" }));
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
        .sl-page {
          min-height: 100dvh;
          background-color: var(--background);
          background-image:
            linear-gradient(45deg, oklch(0.25 0.06 250 / 0.035) 1px, transparent 1px),
            linear-gradient(-45deg, oklch(0.25 0.06 250 / 0.035) 1px, transparent 1px);
          background-size: 28px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          gap: 16px;
        }

        .sl-card {
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
        .sl-card.ready {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── LEFT brand panel ── */
        .sl-brand {
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
          .sl-brand { display: flex; }
        }

        .sl-ghost {
          position: absolute;
          bottom: -40px;
          right: -24px;
          font-family: 'Cairo', sans-serif;
          font-size: clamp(130px, 14vw, 200px);
          font-weight: 700;
          line-height: 0.9;
          color: oklch(1 0 0 / 0.06);
          user-select: none;
          pointer-events: none;
          direction: rtl;
          animation: sl-ghost-breathe 10s ease-in-out infinite alternate;
        }
        @keyframes sl-ghost-breathe {
          from { transform: translateY(0px); }
          to   { transform: translateY(-14px); }
        }

        /* ── RIGHT form panel ── */
        .sl-form-panel {
          flex: 1;
          padding: 40px 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        @media (max-width: 719px) {
          .sl-form-panel { padding: 32px 24px; }
        }

        .sl-item {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.45s cubic-bezier(0.22,1,0.36,1), transform 0.45s cubic-bezier(0.22,1,0.36,1);
        }
        .sl-card.ready .sl-item:nth-child(1) { transition-delay: 120ms; opacity: 1; transform: none; }
        .sl-card.ready .sl-item:nth-child(2) { transition-delay: 190ms; opacity: 1; transform: none; }
        .sl-card.ready .sl-item:nth-child(3) { transition-delay: 255ms; opacity: 1; transform: none; }
        .sl-card.ready .sl-item:nth-child(4) { transition-delay: 315ms; opacity: 1; transform: none; }
        .sl-card.ready .sl-item:nth-child(5) { transition-delay: 375ms; opacity: 1; transform: none; }
        .sl-card.ready .sl-item:nth-child(6) { transition-delay: 430ms; opacity: 1; transform: none; }

        .sl-input {
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
        .sl-input::placeholder { color: var(--muted-foreground); font-weight: 400; opacity: 0.7; }
        .sl-input:focus {
          border-color: var(--ring);
          box-shadow: 0 0 0 3px oklch(0.35 0.06 250 / 0.12);
        }
        .sl-input[type="password"] { letter-spacing: 0.2em; }

        .sl-btn {
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
        .sl-btn:hover:not(:disabled) { opacity: 0.88; }
        .sl-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .sl-pill {
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
        .sl-pill:hover:not(:disabled) {
          background: var(--muted);
          border-color: var(--ring);
        }
        .sl-pill:disabled { opacity: 0.5; cursor: not-allowed; }

        .sl-avatar {
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

        .sl-error {
          padding: 10px 12px;
          background: oklch(0.58 0.22 25 / 0.08);
          border: 1px solid oklch(0.58 0.22 25 / 0.25);
          border-radius: calc(var(--radius) - 2px);
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          color: oklch(0.45 0.18 25);
        }

        .sl-users-reveal {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.35s cubic-bezier(0.22,1,0.36,1);
        }
        .sl-users-reveal.visible { grid-template-rows: 1fr; }
        .sl-users-reveal > div { overflow: hidden; }

        @media (prefers-reduced-motion: reduce) {
          .sl-card, .sl-item, .sl-ghost { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; }
          .sl-users-reveal { transition: none !important; }
        }
      `}</style>

      <div className="sl-page">

        <div className={`sl-card${ready ? " ready" : ""}`}>

          {/* ══ LEFT — Brand panel ══ */}
          <div className="sl-brand">
            <div className="sl-ghost">سكبة</div>

            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
                <img
                  src={SakkbaLogo}
                  alt="Sakkba"
                  style={{ height: 14, width: "auto", filter: "brightness(0) invert(1) opacity(0.85)" }}
                />
                <div style={{ width: 1, height: 18, background: "oklch(1 0 0 / 0.2)" }} />
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.2em",
                  textTransform: "uppercase", color: "oklch(1 0 0 / 0.5)",
                }}>Home Orders</span>
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
                Sakkba<br />Home
              </h1>

              <div style={{ width: 36, height: 2, background: "oklch(1 0 0 / 0.3)", margin: "20px 0" }} />

              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 12, lineHeight: 1.7, fontWeight: 400,
                color: "oklch(1 0 0 / 0.5)", maxWidth: 200,
              }}>
                Home fittings &<br />deliveries — managed.
              </p>
            </div>

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
          <div className="sl-form-panel">

            <div className="sl-item" style={{ marginBottom: 28 }}>
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
              <div className="sl-item sl-error" style={{ marginBottom: 16 }}>{error}</div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); doLogin(username, pin); }}>
              <div className="sl-item" style={{ marginBottom: 14 }}>
                <label style={{
                  display: "block",
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)",
                  marginBottom: 6,
                }}>Username</label>
                <input
                  className="sl-input"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                />
              </div>

              <div className="sl-item" style={{ marginBottom: 20 }}>
                <label style={{
                  display: "block",
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)",
                  marginBottom: 6,
                }}>PIN</label>
                <input
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

              <div className="sl-item">
                <button type="submit" className="sl-btn" disabled={loading}>
                  {loading ? "Signing in…" : "Sign In →"}
                </button>
              </div>
            </form>

            <div className={`sl-users-reveal${users.length > 0 ? " visible" : ""}`}>
              <div>
                <div className="sl-item" style={{ marginTop: 24 }}>
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
                        className="sl-pill"
                        disabled={loading}
                        onClick={() => doLogin(u.username, "1234")}
                      >
                        <div className="sl-avatar">{u.name.slice(0, 2).toUpperCase()}</div>
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

            <div className="sl-item" style={{ marginTop: 28 }}>
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
