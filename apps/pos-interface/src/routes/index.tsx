import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ErthLogo from "@/assets/erth-light.svg";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({ meta: [{ title: "Autolinium: Tailoring Atelier" }] }),
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
          background: #f5f1ea;
          color: #1a1a17;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr auto;
          padding: 32px 40px;
        }

        /* hairline grid texture — quiet, not a decorative pattern */
        .lp::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, rgba(28,38,28,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(28,38,28,0.04) 1px, transparent 1px);
          background-size: 80px 80px;
          pointer-events: none;
        }

        .lp-top {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 2;
        }
        .lp-mark {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .lp-mark img { height: 28px; opacity: 0.85; }
        .lp-mark span {
          font-family: 'Marcellus', serif;
          font-size: 18px;
          color: #1a2e1c;
        }
        .lp-meta {
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          font-weight: 500;
          color: rgba(26,46,28,0.5);
        }

        .lp-stage {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1;
        }

        .lp-arabic {
          font-family: 'Aref Ruqaa', serif;
          font-weight: 700;
          font-size: clamp(260px, 40vw, 520px);
          line-height: 0.85;
          color: #1c3828;
          direction: rtl;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) translateY(-4%);
          letter-spacing: -0.05em;
          opacity: 0;
          transition: opacity 1.1s cubic-bezier(0.22,1,0.36,1) 120ms;
          user-select: none;
          pointer-events: none;
          z-index: 1;
        }
        .lp-arabic.ready { opacity: 0.13; }

        .lp-overlay {
          position: relative;
          z-index: 2;
          text-align: center;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1) 240ms,
                      transform 0.7s cubic-bezier(0.22,1,0.36,1) 240ms;
        }
        .lp-overlay.ready { opacity: 1; transform: none; }

        .lp-wordmark {
          font-family: 'Marcellus', serif;
          font-size: clamp(56px, 9vw, 108px);
          line-height: 1;
          letter-spacing: -0.025em;
          color: #1a2e1c;
          margin: 0;
        }

        .lp-rule {
          width: 48px;
          height: 1px;
          background: rgba(26,46,28,0.55);
          margin: 22px auto 14px;
        }

        .lp-sub {
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: rgba(26,46,28,0.7);
          margin: 0;
        }
        .lp-sub em {
          font-family: 'Marcellus', serif;
          font-style: italic;
          font-weight: 400;
          color: #1c3828;
        }

        .lp-bottom {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: end;
          justify-content: space-between;
        }

        .lp-enter {
          display: inline-flex;
          align-items: baseline;
          gap: 14px;
          background: transparent;
          border: none;
          color: #1a2e1c;
          font-family: 'Marcellus', serif;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
        }
        .lp-enter span:first-child {
          position: relative;
        }
        .lp-enter span:first-child::after {
          content: "";
          position: absolute;
          left: 0; right: 0;
          bottom: -3px;
          height: 1px;
          background: #1a2e1c;
          transform-origin: left;
          transform: scaleX(0.4);
          transition: transform 0.3s cubic-bezier(0.22,1,0.36,1);
        }
        .lp-enter:hover span:first-child::after { transform: scaleX(1); }
        .lp-enter .arrow {
          font-family: 'Montserrat', sans-serif;
          font-size: 14px;
          font-weight: 500;
        }

        .lp-corner {
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          font-weight: 500;
          color: rgba(26,46,28,0.4);
          text-align: right;
          line-height: 1.6;
        }
        .lp-corner b {
          font-weight: 600;
          color: rgba(26,46,28,0.55);
        }

        @media (max-width: 640px) {
          .lp { padding: 24px 22px; }
          .lp-wordmark { font-size: 52px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .lp-arabic, .lp-overlay {
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .lp-arabic { opacity: 0.97 !important; }
        }
      `}</style>

      <div className="lp" onClick={() => navigate({ to: "/home" })}>
        <div className="lp-top">
          <div className="lp-mark">
            <img src={ErthLogo} alt="" />
            <span>Autolinium</span>
          </div>
          <div className="lp-meta">Kuwait · Est. 2020</div>
        </div>

        <div className="lp-stage">
          <div className={`lp-arabic${ready ? " ready" : ""}`}>أرث</div>
          <div className={`lp-overlay${ready ? " ready" : ""}`}>
            <h1 className="lp-wordmark">Autolinium</h1>
            <div className="lp-rule" />
            <p className="lp-sub">
              <em>Tailoring atelier</em> &nbsp;·&nbsp; Bespoke since 2020
            </p>
          </div>
        </div>

        <div className="lp-bottom">
          <button
            type="button"
            className="lp-enter"
            onClick={(e) => { e.stopPropagation(); navigate({ to: "/home" }); }}
          >
            <span>Enter atelier</span>
            <span className="arrow">↗</span>
          </button>
          <div className="lp-corner">
            <b>Press Enter</b><br />
            or click anywhere
          </div>
        </div>
      </div>
    </>
  );
}
