import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";

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
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="absolute top-[15%] left-1/2 -translate-x-1/2 h-px w-32 origin-center"
        style={{ background: "linear-gradient(90deg, transparent, #d4cdaa40, transparent)" }}
      />

      {/* Brand name */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mb-4"
      >
        <h1
          className="brand-font text-5xl md:text-7xl"
          style={{ color: "#d4cdaa" }}
        >
          Autolinium
        </h1>
      </motion.div>

      {/* Tagline */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
        className="relative z-10 text-sm md:text-base tracking-[0.35em] uppercase mb-16"
        style={{ color: "#d4cdaa90", fontFamily: "'Montserrat', sans-serif", fontWeight: 400 }}
      >
        Tailoring Atelier
      </motion.p>

      {/* Decorative diamond */}
      <motion.div
        initial={{ opacity: 0, rotate: 45, scale: 0 }}
        animate={{ opacity: 1, rotate: 45, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.9, ease: "easeOut" }}
        className="relative z-10 w-2 h-2 mb-6"
        style={{ background: "#d4cdaa50" }}
      />

      {/* Enter prompt */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.2 }}
        className="relative z-10 flex flex-col items-center gap-3"
      >
        <p
          className="text-xs tracking-[0.3em] uppercase animate-pulse"
          style={{ color: "#d4cdaa60", fontFamily: "'Montserrat', sans-serif" }}
        >
          Press Enter or Tap
        </p>
      </motion.div>

      {/* Bottom decorative line */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="absolute bottom-[15%] left-1/2 -translate-x-1/2 h-px w-32 origin-center"
        style={{ background: "linear-gradient(90deg, transparent, #d4cdaa40, transparent)" }}
      />

      {/* Corner accents */}
      <div className="absolute top-8 left-8 w-8 h-8 border-l border-t opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute top-8 right-8 w-8 h-8 border-r border-t opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute bottom-8 left-8 w-8 h-8 border-l border-b opacity-10" style={{ borderColor: "#d4cdaa" }} />
      <div className="absolute bottom-8 right-8 w-8 h-8 border-r border-b opacity-10" style={{ borderColor: "#d4cdaa" }} />
    </div>
  );
}
