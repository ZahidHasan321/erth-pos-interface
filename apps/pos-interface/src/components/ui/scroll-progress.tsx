"use client";

import { useScroll, useMotionValueEvent } from "framer-motion";
import * as React from "react";

export function ScrollProgress() {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (barRef.current) {
      barRef.current.style.transform = `scaleX(${v})`;
    }
  });

  return (
    <div
      ref={ref}
      className="fixed top-0 left-0 right-0 h-[2px] bg-linear-to-r from-primary via-secondary to-primary origin-left z-[60] will-change-transform"
    >
      <div
        ref={barRef}
        className="h-full w-full bg-linear-to-r from-primary via-secondary to-primary origin-left"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
