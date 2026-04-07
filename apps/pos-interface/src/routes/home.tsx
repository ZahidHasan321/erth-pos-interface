import { createFileRoute, Link } from "@tanstack/react-router";

import ErthLogo from "../assets/erth-dark.svg";
import SakkbaLogo from "../assets/Sakkba.png";
import { BRAND_NAMES } from "@/lib/constants";
import { useAuth } from "@/context/auth";

export const Route = createFileRoute("/home")({
  component: SelectionPage,
  head: () => ({
    meta: [{ title: "Select Workspace" }],
  }),
});

function SelectionPage() {
  const { user } = useAuth();
  const brands = user?.brands ?? [];
  // Empty brands array = no restriction (admin/superadmin)
  const canAccess = (brand: string) =>
    brands.length === 0 || brands.includes(brand);

  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden px-6 py-12"
      style={{ background: "linear-gradient(160deg, #0c0b09 0%, #141210 40%, #100f0c 70%, #0a0908 100%)" }}
    >
      {/* Geometric pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(30deg, #d4cdaa 1px, transparent 1px),
            linear-gradient(150deg, #d4cdaa 1px, transparent 1px),
            linear-gradient(90deg, #d4cdaa 1px, transparent 1px)
          `,
          backgroundSize: "40px 70px, 40px 70px, 70px 40px",
        }}
      />

      {/* Corner accents */}
      <div className="absolute top-8 left-8 w-8 h-8 border-l border-t opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute top-8 right-8 w-8 h-8 border-r border-t opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute bottom-8 left-8 w-8 h-8 border-l border-b opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute bottom-8 right-8 w-8 h-8 border-r border-b opacity-10" style={{ borderColor: "#d4cdaa" }} />

      {/* Header */}
      <div
        className="relative z-10 text-center mb-12 css-fade-in-up"
        style={{ animationDelay: "0s" }}
      >
        <p
          className="text-xs tracking-[0.4em] uppercase mb-4"
          style={{ color: "#d4cdaa70", fontFamily: "'Montserrat', sans-serif" }}
        >
          Select Workspace
        </p>
        <div
          className="mx-auto h-px w-16"
          style={{ background: "linear-gradient(90deg, transparent, #d4cdaa30, transparent)" }}
        />
      </div>

      {/* Brand cards */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-3xl w-full">
        {/* Erth Card */}
        <div className="css-fade-in-up" style={{ animationDelay: "0.15s" }}>
          <Link
            to="/$main"
            params={{ main: BRAND_NAMES.showroom }}
            className={`group block ${!canAccess(BRAND_NAMES.showroom) ? "opacity-40 pointer-events-none" : ""}`}
          >
            <div
              className="relative rounded-2xl overflow-hidden transition-all duration-500 group-hover:-translate-y-1"
              style={{
                background: "linear-gradient(175deg, #0f1a0f 0%, #162216 50%, #0f170f 100%)",
                border: "1px solid rgba(34, 60, 34, 0.5)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(212,205,170,0.05)",
              }}
            >
              {/* Hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                style={{
                  background: "radial-gradient(ellipse at 50% 30%, rgba(34,80,34,0.15) 0%, transparent 70%)",
                }}
              />

              {/* Fabric texture overlay */}
              <div
                className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity duration-500"
                style={{
                  backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(212,205,170,0.3) 2px, rgba(212,205,170,0.3) 3px)",
                }}
              />

              <div className="relative z-10 flex flex-col items-center px-8 py-10">
                {/* Logo container */}
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-500"
                  style={{
                    background: "linear-gradient(135deg, rgba(34,60,34,0.6), rgba(20,45,20,0.8))",
                    border: "1px solid rgba(60,100,60,0.5)",
                    boxShadow: "0 0 30px rgba(34,60,34,0.3), inset 0 0 20px rgba(212,205,170,0.05)",
                  }}
                >
                  <img src={ErthLogo} alt="Erth" className="w-12 h-12 object-contain drop-shadow-[0_0_8px_rgba(212,205,170,0.3)]" />
                </div>

                {/* Brand name */}
                <h2
                  className="brand-font text-2xl mb-2 capitalize"
                  style={{ color: "#d4cdaa" }}
                >
                  {BRAND_NAMES.showroom}
                </h2>

                {/* Divider */}
                <div
                  className="h-px w-12 my-4"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(34,80,34,0.5), transparent)" }}
                />

                {/* Description */}
                <p
                  className="text-sm text-center leading-relaxed mb-8"
                  style={{ color: "rgba(212,205,170,0.75)", fontFamily: "'Montserrat', sans-serif" }}
                >
                  Showroom management
                  <br />& comprehensive tools
                </p>

                {/* CTA */}
                <div
                  className="w-full py-3 rounded-xl text-center text-sm tracking-[0.15em] uppercase transition-all duration-400 group-hover:tracking-[0.2em]"
                  style={{
                    background: "linear-gradient(135deg, rgba(34,60,34,0.5), rgba(20,40,20,0.7))",
                    border: "1px solid rgba(34,80,34,0.3)",
                    color: "rgba(212,205,170,0.9)",
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Enter
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Sakkba Card */}
        <div className="css-fade-in-up" style={{ animationDelay: "0.3s" }}>
          <Link
            to="/$main"
            params={{ main: BRAND_NAMES.fromHome }}
            className={`group block ${!canAccess(BRAND_NAMES.fromHome) ? "opacity-40 pointer-events-none" : ""}`}
          >
            <div
              className="relative rounded-2xl overflow-hidden transition-all duration-500 group-hover:-translate-y-1"
              style={{
                background: "linear-gradient(175deg, #0f1220 0%, #141a2e 50%, #0f1320 100%)",
                border: "1px solid rgba(40, 50, 80, 0.5)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(212,205,170,0.05)",
              }}
            >
              {/* Hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                style={{
                  background: "radial-gradient(ellipse at 50% 30%, rgba(40,50,100,0.15) 0%, transparent 70%)",
                }}
              />

              {/* Fabric texture overlay */}
              <div
                className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity duration-500"
                style={{
                  backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(212,205,170,0.3) 2px, rgba(212,205,170,0.3) 3px)",
                }}
              />

              <div className="relative z-10 flex flex-col items-center px-8 py-10">
                {/* Logo container */}
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-500"
                  style={{
                    background: "linear-gradient(135deg, rgba(40,50,80,0.6), rgba(25,35,65,0.8))",
                    border: "1px solid rgba(60,75,120,0.5)",
                    boxShadow: "0 0 30px rgba(40,50,80,0.3), inset 0 0 20px rgba(212,205,170,0.05)",
                  }}
                >
                  <img src={SakkbaLogo} alt="Sakkba" className="w-11 h-11 object-contain drop-shadow-[0_0_8px_rgba(212,205,170,0.3)] invert" />
                </div>

                {/* Brand name */}
                <h2
                  className="brand-font text-2xl mb-2 capitalize"
                  style={{ color: "#d4cdaa" }}
                >
                  {BRAND_NAMES.fromHome}
                </h2>

                {/* Divider */}
                <div
                  className="h-px w-12 my-4"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(40,50,100,0.5), transparent)" }}
                />

                {/* Description */}
                <p
                  className="text-sm text-center leading-relaxed mb-8"
                  style={{ color: "rgba(212,205,170,0.75)", fontFamily: "'Montserrat', sans-serif" }}
                >
                  Home-based order
                  <br />management system
                </p>

                {/* CTA */}
                <div
                  className="w-full py-3 rounded-xl text-center text-sm tracking-[0.15em] uppercase transition-all duration-400 group-hover:tracking-[0.2em]"
                  style={{
                    background: "linear-gradient(135deg, rgba(40,50,80,0.5), rgba(25,30,55,0.7))",
                    border: "1px solid rgba(40,60,100,0.3)",
                    color: "rgba(212,205,170,0.9)",
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Enter
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Back link */}
      <div
        className="relative z-10 mt-12 css-fade-in"
        style={{ animationDelay: "0.6s" }}
      >
        <Link
          to="/"
          className="text-xs tracking-[0.2em] uppercase transition-colors duration-300 hover:opacity-80"
          style={{ color: "#d4cdaa30", fontFamily: "'Montserrat', sans-serif" }}
        >
          Back
        </Link>
      </div>
    </div>
  );
}
