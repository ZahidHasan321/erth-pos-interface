import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import ErthLogo from "@/assets/erth-light.svg";
import SakkbaLogo from "@/assets/Sakkba.png";
import { BRAND_NAMES } from "@/lib/constants";
import { useAuth } from "@/context/auth";

export const Route = createFileRoute("/home")({
  component: SelectionPage,
  head: () => ({ meta: [{ title: "Select Workspace" }] }),
});

// Brand-specific tokens (no CSS var dependency — page is brand-neutral)
const ERTH = {
  primary:  "oklch(0.25 0.12 155)",
  bg:       "oklch(0.95 0.02 150)",
  border:   "oklch(0.86 0.03 150)",
  ring:     "oklch(0.35 0.10 155 / 0.15)",
  label:    "erth",
};
const SAKKBA = {
  primary:  "oklch(0.25 0.06 250)",
  bg:       "oklch(0.95 0.008 245)",
  border:   "oklch(0.88 0.015 245)",
  ring:     "oklch(0.35 0.06 250 / 0.15)",
  label:    "sakkba",
};

function BrandCard({
  to,
  logo,
  logoFilter,
  name,
  subtitle,
  description,
  tokens,
  disabled,
}: {
  to: string;
  logo: string;
  logoFilter?: string;
  name: string;
  subtitle: string;
  description: string;
  tokens: typeof ERTH;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      to={to as any}
      style={{ pointerEvents: disabled ? "none" : "auto", display: "block" }}
      tabIndex={disabled ? -1 : 0}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: "oklch(1 0 0)",
          border: `1px solid ${hovered && !disabled ? tokens.border : "oklch(0.88 0 0)"}`,
          borderRadius: "calc(0.75rem + 4px)",
          boxShadow: hovered && !disabled
            ? `0 8px 28px oklch(0 0 0 / 0.08), 0 0 0 4px ${tokens.ring}`
            : "0 2px 8px oklch(0 0 0 / 0.05)",
          overflow: "hidden",
          opacity: disabled ? 0.38 : 1,
          transition: "box-shadow 0.2s, border-color 0.2s, transform 0.2s",
          transform: hovered && !disabled ? "translateY(-3px)" : "none",
        }}
      >
        {/* Colored top accent band */}
        <div style={{
          height: 3,
          background: tokens.primary,
          opacity: disabled ? 0.4 : 1,
        }} />

        <div style={{ padding: "28px 28px 24px" }}>
          {/* Logo + name row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 44, height: 44,
              background: tokens.bg,
              border: `1px solid ${tokens.border}`,
              borderRadius: "0.75rem",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <img
                src={logo}
                alt={name}
                style={{
                  height: 24, width: "auto",
                  filter: logoFilter,
                  opacity: 0.85,
                }}
              />
            </div>
            <div>
              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.22em",
                textTransform: "uppercase", color: tokens.primary,
                margin: "0 0 2px",
              }}>{subtitle}</p>
              <h2 style={{
                fontFamily: "'Marcellus', serif",
                fontSize: 26, lineHeight: 1,
                color: "oklch(0.15 0.03 100)", margin: 0,
              }}>{name}</h2>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "oklch(0.92 0 0)", marginBottom: 16 }} />

          {/* Description */}
          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 13, lineHeight: 1.65, fontWeight: 400,
            color: "oklch(0.40 0 0)", margin: "0 0 24px",
          }}>{description}</p>

          {/* CTA */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "0 16px", height: 36,
            background: hovered && !disabled ? tokens.primary : "transparent",
            color: hovered && !disabled ? "oklch(0.98 0.01 155)" : tokens.primary,
            border: `1px solid ${tokens.primary}`,
            borderRadius: "0.75rem",
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase",
            transition: "background 0.15s, color 0.15s",
          }}>
            Enter →
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

  return (
    <>
      <style>{`
        .hp {
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
          padding: 40px 20px;
          gap: 32px;
        }

        .hp-header {
          text-align: center;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.5s cubic-bezier(0.22,1,0.36,1), transform 0.5s cubic-bezier(0.22,1,0.36,1);
        }
        .hp-header.ready { opacity: 1; transform: none; }

        .hp-cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          width: 100%;
          max-width: 680px;
          opacity: 0;
          transform: translateY(12px);
          transition: opacity 0.5s cubic-bezier(0.22,1,0.36,1) 80ms, transform 0.5s cubic-bezier(0.22,1,0.36,1) 80ms;
        }
        .hp-cards.ready { opacity: 1; transform: none; }

        @media (min-width: 560px) {
          .hp-cards { grid-template-columns: 1fr 1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
          .hp-header, .hp-cards { transition: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <div className="hp">

        {/* Header */}
        <div className={`hp-header${ready ? " ready" : ""}`}>
          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 9, fontWeight: 700, letterSpacing: "0.3em",
            textTransform: "uppercase", color: "oklch(0.40 0 0)",
            marginBottom: 10,
          }}>Autolinium</p>
          <h1 style={{
            fontFamily: "'Marcellus', serif",
            fontSize: "clamp(32px, 5vw, 46px)",
            lineHeight: 1, color: "oklch(0.15 0.03 100)",
            margin: "0 0 12px",
          }}>Select Workspace</h1>
          <div style={{
            width: 36, height: 2,
            background: "oklch(0.38 0.12 165 / 0.4)",
            margin: "0 auto",
          }} />
        </div>

        {/* Brand cards */}
        <div className={`hp-cards${ready ? " ready" : ""}`}>
          <BrandCard
            to={`/${BRAND_NAMES.showroom}`}
            logo={ErthLogo}
            name="Erth"
            subtitle="Showroom"
            description="Order management, fittings & alterations for the showroom."
            tokens={ERTH}
            disabled={!canAccess(BRAND_NAMES.showroom)}
          />
          <BrandCard
            to={`/${BRAND_NAMES.fromHome}`}
            logo={SakkbaLogo}
            logoFilter="grayscale(1) brightness(0.3)"
            name="Sakkba"
            subtitle="Home Orders"
            description="Home-based order management, deliveries & fittings."
            tokens={SAKKBA}
            disabled={!canAccess(BRAND_NAMES.fromHome)}
          />
        </div>

        {/* Back link */}
        <Link
          to="/"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 10, fontWeight: 600, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "oklch(0.40 0 0 / 0.45)",
            textDecoration: "none",
          }}
        >
          ← Back
        </Link>

      </div>
    </>
  );
}
