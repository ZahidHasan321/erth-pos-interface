import * as React from "react";

type Step = {
  title: string;
  id: string;
};

type UseStepNavigationOptions = {
  steps: Step[];
  setCurrentStep: (step: number) => void;
  addSavedStep: (step: number) => void;
  headerOffset?: number;
};

export function useStepNavigation({
  steps,
  setCurrentStep,
  addSavedStep,
  headerOffset = 120,
}: UseStepNavigationOptions) {
  const sectionRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const isManualScrolling = React.useRef(false);

  React.useEffect(() => {
    sectionRefs.current = steps.map((_, i) => sectionRefs.current[i] ?? null);
  }, [steps]);

  const handleStepChange = React.useCallback(
    (i: number) => {
      // Update the current step immediately
      setCurrentStep(i);

      const el = sectionRefs.current[i];
      if (el) {
        const rect = el.getBoundingClientRect();
        const offsetPosition = window.scrollY + rect.top - headerOffset;

        // Set flag to prevent scroll tracking from interfering
        isManualScrolling.current = true;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });

        // Reset flag after scroll completes (smooth scroll takes ~500-800ms)
        setTimeout(() => {
          isManualScrolling.current = false;
        }, 1000);
      }
    },
    [setCurrentStep, headerOffset]
  );

  const handleProceed = React.useCallback(
    (step: number) => {
      addSavedStep(step);
      handleStepChange(step + 1);
    },
    [addSavedStep, handleStepChange]
  );

  const [visibleSteps, setVisibleSteps] = React.useState<number[]>([]);

  // Scroll tracking with RAF throttling
  React.useEffect(() => {
    let ticking = false;

    const updateActive = () => {
      // Don't update if user is manually scrolling via step click
      if (isManualScrolling.current) {
        ticking = false;
        return;
      }

      const viewportHeight = window.innerHeight;
      const viewportTop = window.scrollY + headerOffset;
      const viewportBottom = window.scrollY + viewportHeight;
      const viewportCenter = window.scrollY + viewportHeight / 2;

      // Calculate visibility for all steps
      const currentVisibleSteps: number[] = [];
      const centers = steps.map((_, i) => {
        const el = sectionRefs.current[i];
        if (!el) return Number.POSITIVE_INFINITY;
        
        const rect = el.getBoundingClientRect();
        const elementTop = window.scrollY + rect.top;
        const elementBottom = elementTop + rect.height;
        const elementCenter = elementTop + rect.height / 2;

        // Check if element is significantly visible in viewport
        // Criteria: 
        // 1. Element center is within viewport
        // 2. OR Element covers substantial part of viewport (for large sections)
        // 3. OR Element is fully inside viewport
        
        const isCenterInViewport = elementCenter >= viewportTop && elementCenter <= viewportBottom;
        const isCoveringViewport = elementTop <= viewportTop && elementBottom >= viewportBottom;
        const isFullyInViewport = elementTop >= viewportTop && elementBottom <= viewportBottom;

        // For side-by-side elements (top aligned), we check if they are roughly in the same scroll band
        if (isCenterInViewport || isCoveringViewport || isFullyInViewport) {
          currentVisibleSteps.push(i);
        }

        return elementCenter;
      });

      setVisibleSteps(currentVisibleSteps);

      let nearest = 0;
      let minDist = Infinity;
      centers.forEach((c, idx) => {
        const d = Math.abs(viewportCenter - c);
        if (d < minDist) {
          minDist = d;
          nearest = idx;
        }
      });

      setCurrentStep(nearest);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => updateActive());
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Initial check
    updateActive();

    return () => window.removeEventListener("scroll", onScroll);
  }, [setCurrentStep, steps, headerOffset]);

  return {
    sectionRefs,
    handleStepChange,
    handleProceed,
    visibleSteps,
  };
}
