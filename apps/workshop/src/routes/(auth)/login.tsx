import { useState, useEffect } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/context/auth";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { getTerminalPath, isTerminalUser, JOB_FUNCTION_LABELS, type AuthUser } from "@/lib/rbac";
import type { JobFunction } from "@repo/database";

// Post-login destination. Terminal-locked users go straight to their terminal;
// everyone else lands on Receiving (the ops default).
function getPostLoginPath(user: AuthUser | null): string {
  if (isTerminalUser(user)) {
    const terminal = getTerminalPath(user);
    if (terminal) return terminal;
  }
  return "/receiving";
}

export const Route = createFileRoute("/(auth)/login")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      const dest = getPostLoginPath((context.auth as any).user ?? null);
      throw redirect({ to: dest as any });
    }
  },
  component: LoginPage,
});

const STAGES = [
  "Soaking", "Cutting", "Post-Cutting", "Sewing",
  "Finishing", "Ironing", "Quality Check", "Dispatch",
];

const TICKER = (STAGES.join("  ·  ") + "  ·  ").repeat(5);

type WorkshopUser = {
  id: string;
  username: string;
  name: string;
  role: string | null;
  department: string | null;
  job_functions: string[] | null;
};

function pillSubtitle(u: WorkshopUser): string {
  const jobs = (u.job_functions ?? []).filter((j): j is JobFunction => j in JOB_FUNCTION_LABELS);
  if (jobs.length > 0) {
    return jobs.map((j) => JOB_FUNCTION_LABELS[j]).join(" / ");
  }
  if (u.role === "super_admin") return "Super Admin";
  if (u.role) return u.role.charAt(0).toUpperCase() + u.role.slice(1);
  return "";
}

function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [workshopUsers, setWorkshopUsers] = useState<WorkshopUser[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    db.rpc("get_login_users").then(({ data }) => {
      if (data) {
        const eligible = (data as WorkshopUser[]).filter(
          (u) => u.department === "workshop" || u.role === "super_admin"
        );
        setWorkshopUsers(eligible);
      }
    });
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) {
      const dest = getPostLoginPath(auth.user);
      router.invalidate().then(() => {
        router.navigate({ to: dest as any });
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
    <>
      <style>{`
        /* ── Workshop Login ── */
        .wl {
          min-height: 100dvh;
          background: #0f0e0c;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }

        /* Warm dot grid */
        .wl::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(200,146,42,0.09) 1px, transparent 1px);
          background-size: 26px 26px;
          pointer-events: none;
          z-index: 0;
        }

        .wl-body {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* ── LEFT PANEL ── */
        .wl-left {
          display: none;
          position: relative;
          padding: 44px 40px;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          border-right: 1px solid rgba(200,146,42,0.1);
        }

        @media (min-width: 800px) {
          .wl-body      { flex-direction: row; }
          .wl-left      { display: flex; width: 40%; flex-shrink: 0; }
          .wl-mob-logo  { display: none !important; }
        }

        /* Ghost text — bleeds off bottom-left */
        .wl-ghost {
          position: absolute;
          bottom: -12px;
          left: -8px;
          font-family: 'Marcellus', serif;
          font-size: clamp(110px, 13vw, 190px);
          line-height: 0.82;
          color: rgba(200,146,42,0.038);
          user-select: none;
          pointer-events: none;
          letter-spacing: -0.02em;
        }

        /* ── RIGHT PANEL ── */
        .wl-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 44px 28px;
        }

        .wl-form-wrap {
          width: 100%;
          max-width: 348px;
        }

        /* ── Entrance animations ── */
        @keyframes wl-rise {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes wl-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .wl-ready .wl-a1 { animation: wl-rise 0.6s cubic-bezier(0.22,1,0.36,1)   0ms  both; }
        .wl-ready .wl-a2 { animation: wl-rise 0.6s cubic-bezier(0.22,1,0.36,1)  90ms  both; }
        .wl-ready .wl-a3 { animation: wl-rise 0.6s cubic-bezier(0.22,1,0.36,1) 170ms  both; }
        .wl-ready .wl-a4 { animation: wl-rise 0.6s cubic-bezier(0.22,1,0.36,1) 250ms  both; }
        .wl-ready .wl-a5 { animation: wl-rise 0.6s cubic-bezier(0.22,1,0.36,1) 330ms  both; }
        .wl-ready .wl-a6 { animation: wl-fade 0.7s ease                         440ms both; }

        /* ── Input — underline only ── */
        .wl-label {
          display: block;
          font-family: 'Montserrat', sans-serif;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(240,235,225,0.55);
          margin-bottom: 7px;
        }
        .wl-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(240,235,225,0.22);
          padding: 9px 0;
          font-family: 'Montserrat', sans-serif;
          font-size: 15px;
          font-weight: 500;
          color: #f0ebe1;
          outline: none;
          transition: border-color 0.2s ease;
        }
        .wl-input::placeholder { color: rgba(240,235,225,0.3); font-weight: 400; }
        .wl-input:focus         { border-bottom-color: #c8922a; }
        .wl-input[type="password"] {
          letter-spacing: 0.35em;
          font-size: 19px;
        }

        /* ── Submit button ── */
        .wl-btn {
          width: 100%;
          padding: 14px;
          background: #c8922a;
          border: none;
          border-radius: 0;
          color: #0f0e0c;
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .wl-btn:hover:not(:disabled) { background: #b07820; }
        .wl-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Quick-login pills ── */
        .wl-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          border-radius: 0;
          text-align: left;
        }
        .wl-pill:hover {
          border-color: rgba(200,146,42,0.4);
          background: rgba(200,146,42,0.08);
        }

        /* ── Ticker ── */
        .wl-ticker {
          position: relative;
          z-index: 1;
          border-top: 1px solid rgba(200,146,42,0.09);
          overflow: hidden;
          padding: 9px 0;
          background: rgba(0,0,0,0.18);
        }
        @keyframes wl-scroll {
          from { transform: translateX(0);    }
          to   { transform: translateX(-50%); }
        }
        .wl-ticker-inner {
          display: inline-block;
          white-space: nowrap;
          animation: wl-scroll 36s linear infinite;
          font-family: 'Montserrat', sans-serif;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: rgba(200,146,42,0.4);
        }

        @media (prefers-reduced-motion: reduce) {
          .wl-ready [class^="wl-a"] { animation: none !important; opacity: 1 !important; }
          .wl-ticker-inner           { animation: none !important; }
        }
      `}</style>

      <div className={`wl${ready ? " wl-ready" : ""}`}>
        <div className="wl-body">

          {/* ════════════ LEFT PANEL ════════════ */}
          <div className="wl-left">
            <div className="wl-ghost">WORK<br />SHOP</div>

            {/* Top: wordmark */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 48 }}>
                <div style={{
                  width: 34, height: 34,
                  background: "#c8922a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Marcellus', serif",
                  fontSize: 19, color: "#0f0e0c", flexShrink: 0,
                }}>W</div>
                <div style={{ width: 1, height: 22, background: "rgba(200,146,42,0.5)", flexShrink: 0 }} />
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "rgba(240,235,225,0.5)",
                }}>Workshop System</span>
              </div>

              {/* Display heading */}
              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 9, fontWeight: 700,
                letterSpacing: "0.3em", textTransform: "uppercase",
                color: "#c8922a", marginBottom: 16,
              }}>Production Management</p>

              <h1 style={{
                fontFamily: "'Marcellus', serif",
                fontSize: "clamp(50px, 5.5vw, 72px)",
                lineHeight: 1, letterSpacing: "-0.01em",
                color: "#f0ebe1", margin: 0,
              }}>Work&shy;shop</h1>

              <div style={{
                width: 44, height: 2,
                background: "#c8922a",
                margin: "22px 0",
              }} />

              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 12, fontWeight: 400, lineHeight: 1.7,
                color: "rgba(240,235,225,0.55)",
                maxWidth: 240, margin: 0,
              }}>
                Cutting, sewing, finishing —<br />every stage, in one place.
              </p>
            </div>

            {/* Bottom: stage list */}
            <div style={{ borderTop: "1px solid rgba(240,235,225,0.12)", paddingTop: 22 }}>
              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 8, fontWeight: 700,
                letterSpacing: "0.22em", textTransform: "uppercase",
                color: "rgba(240,235,225,0.4)", marginBottom: 12,
              }}>Stages</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 14px" }}>
                {STAGES.map((s) => (
                  <span key={s} style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 9, fontWeight: 600,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "rgba(200,146,42,0.7)",
                  }}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ════════════ RIGHT PANEL ════════════ */}
          <div className="wl-right">
            <div className="wl-form-wrap">

              {/* Mobile-only wordmark */}
              <div className="wl-mob-logo" style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 36,
              }}>
                <div style={{
                  width: 30, height: 30, background: "#c8922a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Marcellus', serif", fontSize: 16, color: "#0f0e0c",
                }}>W</div>
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "rgba(240,235,225,0.5)",
                }}>Workshop</span>
              </div>

              {/* Heading */}
              <div className="wl-a1" style={{ marginBottom: 36 }}>
                <p style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.3em", textTransform: "uppercase",
                  color: "#c8922a", marginBottom: 10,
                }}>Authorized Access</p>
                <h2 style={{
                  fontFamily: "'Marcellus', serif",
                  fontSize: "clamp(38px, 5vw, 54px)",
                  lineHeight: 1, letterSpacing: "-0.01em",
                  color: "#f0ebe1", margin: 0,
                }}>Sign In</h2>
              </div>

              {/* Form */}
              <form onSubmit={handleLogin}>
                <div className="wl-a2" style={{ marginBottom: 26 }}>
                  <label className="wl-label" htmlFor="ws-username">Username</label>
                  <input
                    id="ws-username"
                    name="username"
                    className="wl-input"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="enter username"
                    required
                  />
                </div>

                <div className="wl-a3" style={{ marginBottom: 38 }}>
                  <label className="wl-label" htmlFor="ws-pin">PIN</label>
                  <input
                    id="ws-pin"
                    name="pin"
                    className="wl-input"
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

                <div className="wl-a4">
                  <button type="submit" className="wl-btn" disabled={loading}>
                    {loading ? "Signing in…" : "Sign In →"}
                  </button>
                </div>
              </form>

              {/* Quick login */}
              <div className="wl-a5" style={{ marginTop: 30 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 1, background: "rgba(240,235,225,0.12)" }} />
                  <span style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 8, fontWeight: 700,
                    letterSpacing: "0.2em", textTransform: "uppercase",
                    color: "rgba(240,235,225,0.35)",
                    whiteSpace: "nowrap",
                  }}>Quick access · PIN 1234</span>
                  <div style={{ flex: 1, height: 1, background: "rgba(240,235,225,0.12)" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  {workshopUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="wl-pill"
                      onClick={() => { setUsername(u.username); setPin("1234"); }}
                    >
                      <span style={{
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: 11, fontWeight: 600,
                        color: "rgba(240,235,225,0.85)",
                      }}>{u.username}</span>
                      <span style={{
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: 8, color: "rgba(240,235,225,0.45)",
                      }}>{pillSubtitle(u)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Copyright */}
              <div className="wl-a6" style={{ marginTop: 40 }}>
                <span style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 8, fontWeight: 600,
                  letterSpacing: "0.15em", textTransform: "uppercase",
                  color: "rgba(240,235,225,0.28)",
                }}>&copy; {new Date().getFullYear()} Alpaca. All rights reserved.</span>
              </div>
            </div>
          </div>

        </div>

        {/* ════════════ TICKER ════════════ */}
        <div className="wl-ticker">
          <div className="wl-ticker-inner">{TICKER}</div>
        </div>
      </div>
    </>
  );
}
