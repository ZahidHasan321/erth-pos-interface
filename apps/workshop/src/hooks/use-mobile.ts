import * as React from "react";

// Matches Tailwind `lg` — below this the sidebar + wide tables get cramped,
// so we swap to card view. Keep in sync with any `lg:` layout classes.
const MOBILE_BREAKPOINT = 1024;

export function useIsMobile() {
  // Initialize synchronously so the first paint already matches the viewport
  // (avoids a flash of the desktop table before useEffect flips to cards).
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);

    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);

    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
