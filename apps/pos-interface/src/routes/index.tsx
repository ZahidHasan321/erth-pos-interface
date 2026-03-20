import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [{ title: "Autolinium — Tailoring Atelier" }],
  }),
});

function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        navigate({ to: "/home" });
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [navigate]);

  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden cursor-pointer"
      onClick={() => navigate({ to: "/home" })}
      style={{ background: "linear-gradient(160deg, #0c0b09 0%, #141210 40%, #100f0c 70%, #0a0908 100%)" }}
    >
      {/* Geometric weave pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(30deg, #d4cdaa 1px, transparent 1px),
            linear-gradient(150deg, #d4cdaa 1px, transparent 1px),
            linear-gradient(90deg, #d4cdaa 1px, transparent 1px)
          `,
          backgroundSize: "40px 70px, 40px 70px, 70px 40px",
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(212,205,170,0.06) 0%, rgba(212,205,170,0.02) 40%, transparent 70%)",
        }}
      />

      {/* Top decorative line */}
      <div
        className="absolute top-[15%] left-1/2 -translate-x-1/2 h-px w-32 origin-center css-scale-in"
        style={{ background: "linear-gradient(90deg, transparent, #d4cdaa40, transparent)", animationDelay: "0.3s" }}
      />

      {/* Brand name */}
      <div
        className="relative z-10 mb-4 css-fade-in-scale"
        style={{ animationDelay: "0.1s" }}
      >
        <h1
          className="brand-font text-5xl md:text-7xl"
          style={{ color: "#d4cdaa" }}
        >
          Autolinium
        </h1>
      </div>

      {/* Tagline */}
      <p
        className="relative z-10 text-sm md:text-base tracking-[0.35em] uppercase mb-16 css-fade-in-up"
        style={{ color: "#d4cdaa90", fontFamily: "'Montserrat', sans-serif", fontWeight: 400, animationDelay: "0.6s" }}
      >
        Tailoring Atelier
      </p>

      {/* Decorative diamond */}
      <div
        className="relative z-10 w-2 h-2 mb-6 css-fade-in-scale"
        style={{ background: "#d4cdaa50", transform: "rotate(45deg)", animationDelay: "0.9s" }}
      />

      {/* Enter prompt */}
      <div
        className="relative z-10 flex flex-col items-center gap-3 css-fade-in"
        style={{ animationDelay: "1.2s" }}
      >
        <p
          className="text-xs tracking-[0.3em] uppercase animate-pulse"
          style={{ color: "#d4cdaa60", fontFamily: "'Montserrat', sans-serif" }}
        >
          Press Enter or Tap
        </p>
      </div>

      {/* Bottom decorative line */}
      <div
        className="absolute bottom-[15%] left-1/2 -translate-x-1/2 h-px w-32 origin-center css-scale-in"
        style={{ background: "linear-gradient(90deg, transparent, #d4cdaa40, transparent)", animationDelay: "0.5s" }}
      />

      {/* Corner accents */}
      <div className="absolute top-8 left-8 w-8 h-8 border-l border-t opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute top-8 right-8 w-8 h-8 border-r border-t opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute bottom-8 left-8 w-8 h-8 border-l border-b opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute bottom-8 right-8 w-8 h-8 border-r border-b opacity-10" style={{ borderColor: "#d4cdaa" }} />
    </div>
  );
}
