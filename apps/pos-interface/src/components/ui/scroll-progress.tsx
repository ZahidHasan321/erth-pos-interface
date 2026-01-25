"use client";

import { motion, useScroll, useSpring } from "framer-motion";
import * as React from "react";

export function ScrollProgress() {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Find the nearest scrollable parent
    if (ref.current) {
      let parent = ref.current.parentElement;
      while (parent) {
        const overflowY = window.getComputedStyle(parent).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          setContainer(parent);
          break;
        }
        parent = parent.parentElement;
      }
    }
  }, []);

  const { scrollYProgress } = useScroll({
    container: container ? { current: container } : undefined,
  });

  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      ref={ref}
      className="fixed top-0 left-0 right-0 h-[2px] bg-linear-to-r from-primary via-secondary to-primary origin-left z-[60]"
      style={{ scaleX }}
    />
  );
}