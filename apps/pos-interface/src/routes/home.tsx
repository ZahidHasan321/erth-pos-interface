import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";

import ErthLogo from "../assets/erth-light.svg";
import SakhtbaLogo from "../assets/Sakkba.png";
import { BRAND_NAMES } from "@/lib/constants";

export const Route = createFileRoute("/home")({
  component: SelectionPage,
  head: () => ({
    meta: [{
      title: "Select Platform",
    }],
    links: [{
      rel: 'icon',
      type: "image/svg+xml",
      href: "/erth-dark.svg"
    }]
  }),
});

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { y: 30, opacity: 0 },
  visible: { y: 0, opacity: 1 },
};

function SelectionPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-linear-to-br from-background via-muted/30 to-background p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-5xl w-full text-center mb-16"
      >
        <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-4 tracking-tight">
          Select Platform
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Choose your workspace to continue
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full"
      >
        {/* Erth Section */}
        <motion.div variants={itemVariants}>
          <Link to="/$main" params={{ main: BRAND_NAMES.showroom }} className="block group h-full">
            <Card className="h-full flex flex-col items-center justify-between p-8 bg-card border-2 border-border hover:border-green-900 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 rounded-2xl overflow-hidden relative">
              {/* Subtle background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              <div className="relative z-10 flex flex-col items-center w-full space-y-6">
                {/* Logo */}
                <div className="bg-background rounded-full p-6 shadow-lg group-hover:scale-110 transition-transform duration-300 w-36 h-36 flex items-center justify-center">
                  <img src={ErthLogo} alt="Erth Logo" className="w-24 h-24 object-contain" />
                </div>

                {/* Title */}
                <h2 className="text-3xl font-bold text-foreground brand-font capitalize min-h-[2.5rem] flex items-center">
                  {BRAND_NAMES.showroom}
                </h2>

                {/* Description */}
                <p className="text-base text-muted-foreground text-center px-4 min-h-[4.5rem] flex items-center leading-relaxed">
                  Showroom management and comprehensive tools
                </p>

                {/* Button */}
                <Button
                  size="lg"
                  className="w-full py-6 text-lg bg-green-950 hover:bg-green-900 text-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 font-semibold border border-green-800/50 hover:border-green-700 hover:-translate-y-1 group"
                >
                  <span className="flex items-center justify-center gap-3">
                    Enter Erth
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </Button>
              </div>
            </Card>
          </Link>
        </motion.div>

        {/* Sakkba Section */}
        <motion.div variants={itemVariants}>
          <Link to="/$main" params={{ main: BRAND_NAMES.fromHome }} className="block group h-full">
            <Card className="h-full flex flex-col items-center justify-between p-8 bg-card border-2 border-border hover:border-blue-900 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 rounded-2xl overflow-hidden relative">
              {/* Subtle background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              <div className="relative z-10 flex flex-col items-center w-full space-y-6">
                {/* Logo */}
                <div className="bg-background rounded-full p-6 shadow-lg group-hover:scale-110 transition-transform duration-300 w-36 h-36 flex items-center justify-center">
                  <img src={SakhtbaLogo} alt="Sakkba Logo" className="w-20 h-20 object-contain" />
                </div>

                {/* Title */}
                <h2 className="text-3xl font-bold text-foreground brand-font capitalize min-h-[2.5rem] flex items-center">
                  {BRAND_NAMES.fromHome}
                </h2>

                {/* Description */}
                <p className="text-base text-muted-foreground text-center px-4 min-h-[4.5rem] flex items-center leading-relaxed">
                  Home-based order management system
                </p>

                {/* Button */}
                <Button
                  size="lg"
                  className="w-full py-6 text-lg bg-blue-950 hover:bg-blue-900 text-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 font-semibold border border-blue-800/50 hover:border-blue-700 hover:-translate-y-1 group"
                >
                  <span className="flex items-center justify-center gap-3">
                    Enter Sakkba
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </Button>
              </div>
            </Card>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
