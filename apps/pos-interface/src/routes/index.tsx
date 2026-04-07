import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ErthLogo from "@/assets/erth-light.svg";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({ meta: [{ title: "Autolinium — Tailoring Atelier" }] }),
});

function LandingPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") navigate({ to: "/home" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <>
      <style>{`
        .lp {
          min-height: 100dvh;
          background-color: oklch(0.965 0.005 100);
          background-image:
            linear-gradient(45deg, oklch(0.38 0.12 165 / 0.03) 1px, transparent 1px),
            linear-gradient(-45deg, oklch(0.38 0.12 165 / 0.03) 1px, transparent 1px);
          background-size: 28px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          padding: 40px 24px;
        }

        /* Arabic ghost — slow breathe */
        .lp-ghost {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-family: 'Cairo', sans-serif;
          font-size: clamp(260px, 35vw, 480px);
          font-weight: 700;
          line-height: 1;
          color: oklch(0.25 0.12 155 / 0.04);
          user-select: none;
          pointer-events: none;
          direction: rtl;
          white-space: nowrap;
          animation: lp-ghost-breathe 12s ease-in-out infinite alternate;
        }
        @keyframes lp-ghost-breathe {
          from { transform: translate(-50%, -50%) scale(1);    }
          to   { transform: translate(-50%, -50%) scale(1.04); }
        }

        /* Content block */
        .lp-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1);
        }
        .lp-content.ready {
          opacity: 1;
          transform: translateY(0);
        }

        .lp-logo {
          height: 56px;
          width: auto;
          margin-bottom: 24px;
          opacity: 0.85;
        }

        .lp-title {
          font-family: 'Marcellus', serif;
          font-size: clamp(44px, 8vw, 88px);
          line-height: 1;
          letter-spacing: -0.02em;
          color: oklch(0.15 0.03 100);
          margin: 0 0 16px;
          text-align: center;
        }

        .lp-divider {
          width: 40px;
          height: 2px;
          background: oklch(0.25 0.12 155 / 0.5);
          margin-bottom: 16px;
        }

        .lp-tagline {
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: oklch(0.40 0 0);
          margin-bottom: 48px;
        }

        .lp-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 28px;
          height: 44px;
          background: oklch(0.25 0.12 155);
          color: oklch(0.98 0.01 155);
          border: none;
          border-radius: 0.75rem;
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .lp-btn:hover { opacity: 0.85; }

        .lp-hint {
          position: absolute;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%);
          font-family: 'Montserrat', sans-serif;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: oklch(0.40 0 0 / 0.35);
          white-space: nowrap;
          animation: lp-hint-pulse 3s ease-in-out infinite;
        }
        @keyframes lp-hint-pulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1;   }
        }

        @media (prefers-reduced-motion: reduce) {
          .lp-ghost, .lp-hint { animation: none !important; }
          .lp-content { transition: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <div className="lp" onClick={() => navigate({ to: "/home" })}>
        <div className="lp-ghost">أرث</div>

        <div className={`lp-content${ready ? " ready" : ""}`}>
          <img src={ErthLogo} alt="Autolinium" className="lp-logo" />
          <h1 className="lp-title">Autolinium</h1>
          <div className="lp-divider" />
          <p className="lp-tagline">Tailoring Atelier</p>
          <button
            className="lp-btn"
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate({ to: "/home" }); }}
          >
            Enter →
          </button>
        </div>

        <p className="lp-hint">or press Enter</p>
      </div>
    </>
  );
}
