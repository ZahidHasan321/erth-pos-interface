import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import ErthLogoDark from "../assets/erth-dark.svg";
import SakkbaLogo from "../assets/Sakkba.png";
import QassLogo from "../assets/qass-dark.svg";
import { BRAND_NAMES } from "@/lib/constants";
import { useAuth } from "@/context/auth";

export const Route = createFileRoute("/home")({
  component: SelectionPage,
  head: () => ({ meta: [{ title: "Select Workspace" }] }),
});

type BrandKey = "erth" | "sakkba" | "qass";

const BRANDS: Record<BrandKey, {
  bg: string;
  fg: string;
  fgMuted: string;
  hairline: string;
  watermark: string;
  watermarkWidth: number;
  watermarkInvert: boolean;
  watermarkTop: number | "auto";
  watermarkBottom: number | "auto";
  watermarkOpacity: number;
}> = {
  erth: {
    bg: "#1c3828",
    fg: "#f5f1ea",
    fgMuted: "rgba(245,241,234,0.62)",
    hairline: "rgba(245,241,234,0.18)",
    watermark: ErthLogoDark,
    watermarkWidth: 340,
    watermarkInvert: false,
    watermarkTop: -40,
    watermarkBottom: "auto",
    watermarkOpacity: 0.22,
  },
  sakkba: {
    bg: "#1a2547",
    fg: "#e8e5dc",
    fgMuted: "rgba(232,229,220,0.6)",
    hairline: "rgba(232,229,220,0.16)",
    watermark: SakkbaLogo,
    watermarkWidth: 520,
    watermarkInvert: true,
    watermarkTop: "auto",
    watermarkBottom: -20,
    watermarkOpacity: 0.2,
  },
  qass: {
    bg: "#361206",
    fg: "#f3e7d9",
    fgMuted: "rgba(243,231,217,0.62)",
    hairline: "rgba(243,231,217,0.18)",
    watermark: QassLogo,
    watermarkWidth: 360,
    watermarkInvert: true,
    watermarkTop: 52,
    watermarkBottom: "auto",
    watermarkOpacity: 0.16,
  },
};

const WHITE_TINT = "brightness(0) invert(1)";

function BrandCard({
  to,
  params,
  logo,
  logoFilter,
  logoSize = 22,
  name,
  department,
  description,
  brand,
  disabled,
}: {
  to: string;
  params?: Record<string, string>;
  logo: string;
  logoFilter?: string;
  logoSize?: number;
  name: string;
  department: string;
  description: string;
  brand: BrandKey;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const t = BRANDS[brand];

  return (
    <Link
      to={to as LinkProps["to"]}
      params={params as LinkProps["params"]}
      style={{
        pointerEvents: disabled ? "none" : "auto",
        display: "block",
        textDecoration: "none",
        opacity: disabled ? 0.4 : 1,
      }}
      tabIndex={disabled ? -1 : 0}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          background: t.bg,
          color: t.fg,
          borderRadius: 6,
          overflow: "hidden",
          height: 200,
          transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s",
          transform: hovered && !disabled ? "translateY(-2px)" : "translateY(0)",
          boxShadow: hovered
            ? "0 18px 32px -16px rgba(0,0,0,0.32), 0 4px 8px -4px rgba(0,0,0,0.12)"
            : "0 6px 14px -8px rgba(0,0,0,0.18)",
        }}
      >
        {/* Brand-logo watermark */}
        <img
          src={t.watermark}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            top: t.watermarkTop,
            bottom: t.watermarkBottom,
            right: -28,
            width: t.watermarkWidth,
            height: "auto",
            opacity: t.watermarkOpacity,
            filter: t.watermarkInvert ? WHITE_TINT : undefined,
            userSelect: "none",
            pointerEvents: "none",
            transform: hovered ? "translateX(-4px)" : "translateX(0)",
            transition: "transform 0.4s cubic-bezier(0.22,1,0.36,1)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            padding: "20px 22px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <img
              src={logo}
              alt=""
              style={{
                height: logoSize,
                width: "auto",
                filter: logoFilter,
                opacity: 0.92,
              }}
            />
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 10,
                fontWeight: 500,
                color: t.fgMuted,
              }}
            >
              {department}
            </span>
          </div>

          <div>
            <h2
              style={{
                fontFamily: "'Marcellus', serif",
                fontSize: 32,
                lineHeight: 1,
                letterSpacing: "-0.015em",
                color: t.fg,
                margin: "0 0 6px",
              }}
            >
              {name}
            </h2>
            <p
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 12,
                lineHeight: 1.5,
                color: t.fgMuted,
                margin: 0,
                maxWidth: 280,
              }}
            >
              {description}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 12,
              borderTop: `1px solid ${t.hairline}`,
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <span style={{ color: t.fg }}>Enter</span>
            <span
              style={{
                color: t.fg,
                transform: hovered ? "translateX(4px)" : "translateX(0)",
                transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SelectionPage() {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  const brands = user?.brands ?? [];
  const canAccess = (brand: string) => brands.length === 0 || brands.includes(brand);
  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      <style>{`
        .hp {
          min-height: 100dvh;
          background: #f5f1ea;
          color: #1a1a17;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
        }
        .hp-frame {
          width: 100%;
          max-width: 720px;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.6s cubic-bezier(0.22,1,0.36,1),
                      transform 0.6s cubic-bezier(0.22,1,0.36,1);
        }
        .hp-frame.ready { opacity: 1; transform: none; }

        .hp-header {
          display: flex;
          align-items: end;
          justify-content: space-between;
          margin-bottom: 22px;
        }
        .hp-title {
          font-family: 'Marcellus', serif;
          font-size: 28px;
          line-height: 1.1;
          letter-spacing: -0.015em;
          color: #1a2e1c;
          margin: 0;
        }
        .hp-title em { font-style: italic; color: rgba(26,46,28,0.55); }
        .hp-back {
          font-family: 'Montserrat', sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: rgba(26,46,28,0.5);
          text-decoration: none;
        }
        .hp-back:hover { color: #1a2e1c; }

        .hp-cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        @media (min-width: 600px) {
          .hp-cards { grid-template-columns: 1fr 1fr; gap: 16px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .hp-frame { transition: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <div className="hp">
        <div className={`hp-frame${ready ? " ready" : ""}`}>
          <div className="hp-header">
            <h1 className="hp-title">
              {firstName ? <>Welcome back, <em>{firstName}</em></> : <>Choose <em>workspace</em></>}
            </h1>
            <Link to="/" className="hp-back">← Back</Link>
          </div>

          <div className="hp-cards">
            <BrandCard
              to="/$main"
              params={{ main: BRAND_NAMES.showroom }}
              logo={ErthLogoDark}
              logoSize={22}
              name="Erth"
              department="Showroom"
              description="Orders, fittings and alterations on the showroom floor."
              brand="erth"
              disabled={!canAccess(BRAND_NAMES.showroom)}
            />
            <BrandCard
              to="/$main"
              params={{ main: BRAND_NAMES.fromHome }}
              logo={SakkbaLogo}
              logoFilter={WHITE_TINT}
              logoSize={14}
              name="Sakkba"
              department="Home orders"
              description="Home-based orders, deliveries and on-site fittings."
              brand="sakkba"
              disabled={!canAccess(BRAND_NAMES.fromHome)}
            />
            <BrandCard
              to="/$main"
              params={{ main: BRAND_NAMES.qass }}
              logo={QassLogo}
              logoFilter={WHITE_TINT}
              logoSize={22}
              name="Qass"
              department="Showroom"
              description="Bespoke dishdasha orders, fittings and alterations for Qass."
              brand="qass"
              disabled={!canAccess(BRAND_NAMES.qass)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
