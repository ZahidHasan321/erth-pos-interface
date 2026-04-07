import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import ErthLogo from "../assets/erth-light.svg";
import SakkbaLogo from "../assets/Sakkba.png";
import { BRAND_NAMES } from "@/lib/constants";
import { useAuth } from "@/context/auth";

export const Route = createFileRoute("/home")({
  component: SelectionPage,
  head: () => ({ meta: [{ title: "Select Workspace" }] }),
});

const BRANDS = {
  erth: {
    primary:     "#1c3828",
    primaryRgb:  "28,56,40",
    bgTint:      "rgba(28,56,40,0.10)",
    borderTint:  "rgba(28,56,40,0.22)",
    hoverShadow: "0 8px 32px rgba(28,56,40,0.14), 0 2px 8px rgba(0,0,0,0.06)",
    hoverBorder: "rgba(28,56,40,0.35)",
    divider:     "rgba(28,56,40,0.12)",
    textAccent:  "#1c3828",
  },
  sakkba: {
    primary:     "#1a2547",
    primaryRgb:  "26,37,71",
    bgTint:      "rgba(26,37,71,0.10)",
    borderTint:  "rgba(26,37,71,0.22)",
    hoverShadow: "0 8px 32px rgba(26,37,71,0.14), 0 2px 8px rgba(0,0,0,0.06)",
    hoverBorder: "rgba(26,37,71,0.35)",
    divider:     "rgba(26,37,71,0.12)",
    textAccent:  "#1a2547",
  },
};

function BrandCard({
  to,
  params,
  logo,
  logoFilter,
  logoSize = 32,
  name,
  subtitle,
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
  subtitle: string;
  description: string;
  brand: keyof typeof BRANDS;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const t = BRANDS[brand];

  return (
    <Link
      to={to as any}
      params={params as any}
      style={{ pointerEvents: disabled ? "none" : "auto", display: "block", textDecoration: "none" }}
      tabIndex={disabled ? -1 : 0}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          background: `linear-gradient(160deg, rgba(${t.primaryRgb},0.05) 0%, #ffffff 45%)`,
          border: `1px solid ${hovered ? t.hoverBorder : t.borderTint}`,
          borderRadius: "1.25rem",
          boxShadow: hovered ? t.hoverShadow : "0 2px 8px rgba(0,0,0,0.05)",
          overflow: "hidden",
          opacity: disabled ? 0.35 : 1,
          transform: hovered && !disabled ? "translateY(-4px)" : "translateY(0)",
          transition: "box-shadow 0.25s, border-color 0.25s, transform 0.25s",
        }}
      >
        <div style={{ position: "relative", zIndex: 1, padding: "28px 28px 28px" }}>

          {/* Icon circle */}
          <div style={{
            width: 72, height: 72,
            borderRadius: "50%",
            background: t.bgTint,
            border: `1px solid ${t.borderTint}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 20,
            transform: hovered ? "scale(1.05)" : "scale(1)",
            transition: "transform 0.3s, box-shadow 0.3s",
            boxShadow: hovered ? `0 6px 20px rgba(${t.primaryRgb},0.18)` : `0 2px 8px rgba(${t.primaryRgb},0.10)`,
          }}>
            <img
              src={logo}
              alt={name}
              style={{
                height: logoSize,
                width: "auto",
                filter: logoFilter,
                opacity: 0.9,
              }}
            />
          </div>

          {/* Name + subtitle */}
          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 9, fontWeight: 700, letterSpacing: "0.24em",
            textTransform: "uppercase", color: t.textAccent,
            margin: "0 0 4px", opacity: 0.7,
          }}>{subtitle}</p>
          <h2 style={{
            fontFamily: "'Marcellus', serif",
            fontSize: 30, lineHeight: 1,
            color: "oklch(0.15 0.03 100)", margin: "0 0 16px",
          }}>{name}</h2>

          {/* Divider */}
          <div style={{ height: 1, background: t.divider, marginBottom: 14 }} />

          {/* Description */}
          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 13, lineHeight: 1.7, fontWeight: 400,
            color: "oklch(0.42 0 0)", margin: "0 0 24px",
          }}>{description}</p>

          {/* CTA button */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "0 18px", height: 38,
            background: hovered ? t.primary : t.bgTint,
            color: hovered ? "#fff" : t.textAccent,
            border: `1px solid ${hovered ? t.primary : t.borderTint}`,
            borderRadius: "0.75rem",
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 11, fontWeight: 700,
            letterSpacing: hovered ? "0.18em" : "0.12em",
            textTransform: "uppercase",
            transition: "all 0.2s",
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
          max-width: 720px;
          opacity: 0;
          transform: translateY(12px);
          transition: opacity 0.5s cubic-bezier(0.22,1,0.36,1) 80ms, transform 0.5s cubic-bezier(0.22,1,0.36,1) 80ms;
        }
        .hp-cards.ready { opacity: 1; transform: none; }
        @media (min-width: 580px) { .hp-cards { grid-template-columns: 1fr 1fr; } }
        @media (prefers-reduced-motion: reduce) {
          .hp-header, .hp-cards { transition: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <div className="hp">

        <div className={`hp-header${ready ? " ready" : ""}`}>
          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 9, fontWeight: 700, letterSpacing: "0.35em",
            textTransform: "uppercase", color: "oklch(0.40 0 0 / 0.55)",
            marginBottom: 10,
          }}>Autolinium</p>
          <h1 style={{
            fontFamily: "'Marcellus', serif",
            fontSize: "clamp(28px, 5vw, 42px)",
            lineHeight: 1, color: "oklch(0.15 0.03 100)",
            margin: "0 0 14px",
          }}>Select Workspace</h1>
          <div style={{ width: 36, height: 2, background: "oklch(0.38 0.12 165 / 0.35)", margin: "0 auto" }} />
        </div>

        <div className={`hp-cards${ready ? " ready" : ""}`}>
          <BrandCard
            to="/$main"
            params={{ main: BRAND_NAMES.showroom }}
            logo={ErthLogo}
            name="Erth"
            subtitle="Showroom"
            description="Order management, fittings & alterations for the showroom."
            brand="erth"
            disabled={!canAccess(BRAND_NAMES.showroom)}
          />
          <BrandCard
            to="/$main"
            params={{ main: BRAND_NAMES.fromHome }}
            logo={SakkbaLogo}
            logoFilter="grayscale(1) brightness(0.25)"
            logoSize={12}
            name="Sakkba"
            subtitle="Home Orders"
            description="Home-based order management, deliveries & fittings."
            brand="sakkba"
            disabled={!canAccess(BRAND_NAMES.fromHome)}
          />
        </div>

        <Link
          to="/"
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
