import type { Variants } from "framer-motion";

/**
 * Standard transition timings for consistency
 */
export const TRANSITIONS = {
  default: { type: "spring", stiffness: 300, damping: 30 } as const,
  smooth: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1.0] } as const,
  quick: { duration: 0.2, ease: "easeOut" } as const,
  stagger: 0.05,
};

/**
 * Page entry animations
 */
export const PAGE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { 
      ...TRANSITIONS.smooth,
      when: "beforeChildren",
      staggerChildren: TRANSITIONS.stagger
    }
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: TRANSITIONS.quick
  }
};

/**
 * Item entry animations (use within staggered container)
 */
export const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: TRANSITIONS.default
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    transition: TRANSITIONS.quick
  }
};

/**
 * Subtle hover animations
 */
export const HOVER_VARIANTS = {
  subtle: { scale: 1.01, transition: TRANSITIONS.quick },
  tap: { scale: 0.98, transition: TRANSITIONS.quick },
};

/**
 * Shared Tailwind animation classes for CSS-only components
 * Aligned with the Framer Motion timings above
 */
export const ANIMATION_CLASSES = {
  fadeInUp: "animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both",
  fadeInDown: "animate-in fade-in slide-in-from-top-4 duration-500 fill-mode-both",
  zoomIn: "animate-in fade-in zoom-in-95 duration-300 fill-mode-both",
  staggerDelay: (index: number) => ({
    animationDelay: `${index * 50}ms`,
  }),
};
