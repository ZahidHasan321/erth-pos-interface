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

  // Helper to find the scrollable parent
  const getScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
    if (!node) return window;
    let parent = node.parentElement;
    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        return parent;
      }
      parent = parent.parentElement;
    }
    return window;
  };

  React.useEffect(() => {
    sectionRefs.current = steps.map((_, i) => sectionRefs.current[i] ?? null);
  }, [steps]);

  const handleStepChange = React.useCallback(
    (i: number) => {
      const el = sectionRefs.current[i];
      
      if (el) {
        // Update the current step immediately
        setCurrentStep(i);

        const scrollParent = getScrollParent(el);
        const isWindow = scrollParent === window;

        let targetTop = 0;
        if (isWindow) {
          const rect = el.getBoundingClientRect();
          targetTop = window.scrollY + rect.top - headerOffset;
        } else {
          // Calculate position relative to the scrollable parent
          const parent = scrollParent as HTMLElement;
          targetTop = (el.offsetTop - parent.offsetTop) - headerOffset;
        }

        // Set flag to prevent scroll tracking from interfering
        isManualScrolling.current = true;

        scrollParent.scrollTo({
          top: targetTop,
          behavior: "smooth",
        });

        // Reset flag after scroll completes
        setTimeout(() => {
          isManualScrolling.current = false;
        }, 1200);
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
    const scrollParent = getScrollParent(sectionRefs.current[0]);

    const updateActive = () => {
      // Don't update if user is manually scrolling via step click
      if (isManualScrolling.current) {
        ticking = false;
        return;
      }

      const isWindow = scrollParent === window;
      const viewportHeight = isWindow ? window.innerHeight : (scrollParent as HTMLElement).clientHeight;
      const scrollY = isWindow ? window.scrollY : (scrollParent as HTMLElement).scrollTop;
      
      const viewportTop = scrollY + headerOffset;
      const viewportBottom = scrollY + viewportHeight;
      const viewportCenter = scrollY + (viewportHeight / 2);

      // Calculate visibility for all steps
      const currentVisibleSteps: number[] = [];
      const centers = steps.map((_, i) => {
        const el = sectionRefs.current[i];
        if (!el) return Number.POSITIVE_INFINITY;
        
        let elementTop = 0;
        let elementHeight = el.offsetHeight;

        if (isWindow) {
          const rect = el.getBoundingClientRect();
          elementTop = window.scrollY + rect.top;
        } else {
          const parent = scrollParent as HTMLElement;
          elementTop = el.offsetTop - parent.offsetTop;
        }

        const elementBottom = elementTop + elementHeight;
        const elementCenter = elementTop + (elementHeight / 2);

        // Check if element is significantly visible in viewport
        const isCenterInViewport = elementCenter >= viewportTop && elementCenter <= viewportBottom;
        const isCoveringViewport = elementTop <= viewportTop && elementBottom >= viewportBottom;
        const isFullyInViewport = elementTop >= viewportTop && elementBottom <= viewportBottom;

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

    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    // Initial check
    updateActive();

    return () => scrollParent.removeEventListener("scroll", onScroll);
  }, [setCurrentStep, steps, headerOffset]);

  return {
    sectionRefs,
    handleStepChange,
    handleProceed,
    visibleSteps,
  };
}
