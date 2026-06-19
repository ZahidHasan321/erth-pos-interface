import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({ meta: [{ title: "Alpaca · Tailoring" }] }),
});

// Wordmark assembled letter-by-letter. Each glyph streams in from off the left,
// sweeps rightward past its home (a small overshoot), then settles back into
// place — a "flock" crossing the stage. Per-letter values give it variety:
//   y0   vertical offset of the left-side entry point
//   rot  tilt while in flight (resolves to 0)
//   over how far past home it overshoots to the right before settling
const WORDMARK = "Alpaca";
const LETTER_FLY = [
  { y0: -34, rot: -10, over: 36 },
  { y0: 24, rot: 8, over: 28 },
  { y0: -16, rot: -7, over: 32 },
  { y0: 28, rot: 9, over: 24 },
  { y0: -26, rot: -8, over: 30 },
  { y0: 18, rot: 7, over: 26 },
];

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// The tape's reveal over time: it pulls OUT to full length, holds, draws BACK,
// holds, and repeats — the honest motion of a tape measure. Returns 0..1 (the
// fraction of the tape currently extended). The shape never changes, so there
// is no slither: only the length animates.
const TAPE_MIN = 0.08; // never fully disappears — a small stub stays out
const CYCLE = { ext: 3000, holdOut: 1300, ret: 1200, holdIn: 800 };
function tapeProgress(t: number) {
  const total = CYCLE.ext + CYCLE.holdOut + CYCLE.ret + CYCLE.holdIn;
  let p = t % total;
  if (p < CYCLE.ext) return TAPE_MIN + (1 - TAPE_MIN) * easeInOut(p / CYCLE.ext);
  p -= CYCLE.ext;
  if (p < CYCLE.holdOut) return 1;
  p -= CYCLE.holdOut;
  if (p < CYCLE.ret) return 1 - (1 - TAPE_MIN) * easeInOut(p / CYCLE.ret);
  return TAPE_MIN;
}

// A soft tailor's measuring tape rendered on canvas so it can both look like a
// real object (ivory ribbon, drop shadow, graduated ticks, metal end-cap) and
// animate honestly. Two of these frame the page — one entering from the left
// near the bottom, one from the right near the top — pulling out and drawing
// back out of phase. The resting shape is a single gentle sag (a tape laid out
// with a little droop), so it never reads as a wave/snake; only the length
// animates. `anchorSide` is the off-screen reel end; the metal cap leads the
// other end. Numbers count from the reel and stay upright.
const TAPE_HW = 19; // half the tape width
const UNIT_PX = 13; // x-spacing between minor ticks
const TAPE_SAG = 16; // how far the middle droops

type TapeCfg = {
  xLeft: number;
  xRight: number;
  baseY: number;
  anchorSide: "left" | "right";
  progress: number;
};

function drawTape(ctx: CanvasRenderingContext2D, cfg: TapeCfg) {
  const { xLeft, xRight, baseY, anchorSide, progress } = cfg;
  const span = xRight - xLeft;
  if (span <= 0) return;

  const tipX = anchorSide === "left" ? xLeft + span * progress : xRight - span * progress;
  const lo = anchorSide === "left" ? xLeft : tipX;
  const hi = anchorSide === "left" ? tipX : xRight;
  if (hi - lo < 1) return;

  // fixed single-sag centerline + slope (no time term => no slither)
  const cy = (x: number) => baseY + TAPE_SAG * Math.sin(Math.PI * ((x - xLeft) / span));
  const slope = (x: number) => TAPE_SAG * (Math.PI / span) * Math.cos(Math.PI * ((x - xLeft) / span));
  const norm = (x: number) => {
    const ang = Math.atan2(slope(x), 1);
    return { nx: Math.cos(ang - Math.PI / 2), ny: Math.sin(ang - Math.PI / 2) };
  };

  // sample the visible ribbon spine
  const pts: { x: number; y: number; nx: number; ny: number }[] = [];
  const step = 6;
  for (let x = lo; x <= hi; x += step) {
    const { nx, ny } = norm(x);
    pts.push({ x, y: cy(x), nx, ny });
  }
  if (pts[pts.length - 1].x < hi) {
    const { nx, ny } = norm(hi);
    pts.push({ x: hi, y: cy(hi), nx, ny });
  }
  if (pts.length < 2) return;

  // --- ribbon body (filled, with depth shadow + cross-width shading) ---
  ctx.save();
  ctx.beginPath();
  pts.forEach((p, i) => {
    const tx = p.x + p.nx * TAPE_HW;
    const ty = p.y + p.ny * TAPE_HW;
    i ? ctx.lineTo(tx, ty) : ctx.moveTo(tx, ty);
  });
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    ctx.lineTo(p.x - p.nx * TAPE_HW, p.y - p.ny * TAPE_HW);
  }
  ctx.closePath();
  ctx.shadowColor = "rgba(45,45,30,0.18)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 7;
  const grad = ctx.createLinearGradient(0, baseY - TAPE_HW, 0, baseY + TAPE_HW);
  grad.addColorStop(0, "#fdfbf6");
  grad.addColorStop(0.5, "#f8f3ea");
  grad.addColorStop(1, "#ece5d6");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // crisp edges
  ctx.save();
  ctx.strokeStyle = "rgba(26,46,28,0.2)";
  ctx.lineWidth = 1;
  for (const side of [1, -1]) {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const ex = p.x + p.nx * TAPE_HW * side;
      const ey = p.y + p.ny * TAPE_HW * side;
      i ? ctx.lineTo(ex, ey) : ctx.moveTo(ex, ey);
    });
    ctx.stroke();
  }
  ctx.restore();

  // --- graduated ticks + numbers, hung from the upper edge ---
  ctx.lineCap = "butt";
  const anchorX = anchorSide === "left" ? xLeft : xRight;
  const dir = anchorSide === "left" ? 1 : -1;
  const maxU = Math.floor(span / UNIT_PX);
  for (let u = 0; u <= maxU; u++) {
    const x = anchorX + dir * u * UNIT_PX;
    if (x < lo || x > hi) continue;
    const { nx, ny } = norm(x);
    const y = cy(x);
    const major = u % 10 === 0;
    const medium = !major && u % 5 === 0;
    // graduated, never the full width — the lower half stays clear for numbers
    const tlen = major ? 16 : medium ? 11 : 6;
    ctx.strokeStyle = major
      ? "rgba(26,46,28,0.8)"
      : medium
        ? "rgba(26,46,28,0.6)"
        : "rgba(26,46,28,0.42)";
    ctx.lineWidth = major ? 1.6 : medium ? 1.3 : 1;
    ctx.beginPath();
    ctx.moveTo(x + nx * TAPE_HW, y + ny * TAPE_HW);
    ctx.lineTo(x + nx * (TAPE_HW - tlen), y + ny * (TAPE_HW - tlen));
    ctx.stroke();

    if (major && u > 0) {
      ctx.fillStyle = "rgba(26,46,28,0.72)";
      ctx.font = "600 12px Montserrat, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(u), x - nx * (TAPE_HW - 10), y - ny * (TAPE_HW - 10));
    }
  }

  // --- metal end-cap at the leading (tip) end ---
  if (progress > 0.02) {
    const ang = Math.atan2(slope(tipX), 1);
    ctx.save();
    ctx.translate(tipX, cy(tipX));
    ctx.rotate(ang);
    const tabW = 8;
    const tabH = TAPE_HW * 2 + 12;
    const mg = ctx.createLinearGradient(-tabW / 2, 0, tabW / 2, 0);
    mg.addColorStop(0, "#d3d6ce");
    mg.addColorStop(0.5, "#8b9187");
    mg.addColorStop(1, "#d3d6ce");
    ctx.fillStyle = mg;
    ctx.strokeStyle = "rgba(40,45,38,0.55)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(-tabW / 2, -tabH / 2, tabW, tabH, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function LandingPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;

    const render = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      // a single tape — reel off the left edge, pulls out to the right
      drawTape(ctx, {
        xLeft: -50,
        xRight: W * 0.8,
        baseY: H - 122,
        anchorSide: "left",
        progress: reduce ? 1 : tapeProgress(t),
      });
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) render(0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let start = 0;
    const frame = (ts: number) => {
      if (!start) start = ts;
      render(ts - start);
      raf = requestAnimationFrame(frame);
    };
    if (!reduce) raf = requestAnimationFrame(frame);
    // redraw once the webfont lands so the numbers aren't a fallback face
    document.fonts?.ready.then(() => {
      if (reduce) render(0);
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

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

        /* the live measuring-tape canvas — full-bleed; tapes drawn top + bottom */
        .lp-tape {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
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
          z-index: 2;
        }

        .lp-overlay {
          position: relative;
          z-index: 2;
          text-align: center;
        }

        .lp-wordmark {
          font-family: 'Marcellus', serif;
          font-size: clamp(56px, 9vw, 108px);
          line-height: 1;
          letter-spacing: -0.025em;
          color: #1a2e1c;
          margin: 0;
          display: flex;
          justify-content: center;
        }

        /* each letter streams in from off the left, sweeps rightward past home
           (the --over overshoot), then settles back; --delay staggers the flock
           so the letters cross the stage one after another */
        .lp-letter {
          display: inline-block;
          white-space: pre;
          opacity: 0;
          will-change: transform, opacity, filter;
        }
        .lp-wordmark.ready .lp-letter {
          animation: lp-fly 1.05s cubic-bezier(0.2, 0.72, 0.18, 1) var(--delay) both;
        }
        @keyframes lp-fly {
          0% {
            opacity: 0;
            transform: translate(-88vw, var(--y0)) rotate(var(--rot)) scale(0.82);
            filter: blur(10px);
          }
          55% {
            opacity: 1;
            filter: blur(1.5px);
          }
          74% {
            transform: translate(var(--over), 0) rotate(0deg) scale(1.015);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translate(0, 0) rotate(0deg) scale(1);
            filter: blur(0);
          }
        }

        .lp-sub {
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: rgba(26,46,28,0.7);
          margin: 30px 0 0;
          opacity: 0;
          transform: translateY(6px);
          transition: opacity 0.6s ease 1620ms,
                      transform 0.6s cubic-bezier(0.22,1,0.36,1) 1620ms;
        }
        .lp-overlay.ready .lp-sub { opacity: 1; transform: none; }

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
          .lp-letter, .lp-sub {
            animation: none !important;
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
        }
      `}</style>

      <div
        className={`lp${ready ? " ready" : ""}`}
        onClick={() => navigate({ to: "/home" })}
      >
        <canvas ref={canvasRef} className="lp-tape" aria-hidden="true" />

        <div className="lp-top">
          <div className="lp-mark">
            <span>Alpaca</span>
          </div>
          <div className="lp-meta">Kuwait</div>
        </div>

        <div className="lp-stage">
          <div className={`lp-overlay${ready ? " ready" : ""}`}>
            <h1 className={`lp-wordmark${ready ? " ready" : ""}`} aria-label={WORDMARK}>
              {WORDMARK.split("").map((ch, i) => {
                const f = LETTER_FLY[i % LETTER_FLY.length];
                return (
                  <span
                    key={i}
                    className="lp-letter"
                    aria-hidden="true"
                    style={
                      {
                        "--y0": `${f.y0}px`,
                        "--rot": `${f.rot}deg`,
                        "--over": `${f.over}px`,
                        "--delay": `${70 + i * 80}ms`,
                      } as CSSProperties
                    }
                  >
                    {ch}
                  </span>
                );
              })}
            </h1>
            <p className="lp-sub">Master tailors &nbsp;·&nbsp; Kuwait</p>
          </div>
        </div>

        <div className="lp-bottom">
          <button
            type="button"
            className="lp-enter"
            onClick={(e) => { e.stopPropagation(); navigate({ to: "/home" }); }}
          >
            <span>Enter</span>
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
