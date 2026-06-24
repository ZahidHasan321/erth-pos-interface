import { useEffect, useRef, useState } from "react";

interface UseDelayedLoadingOptions {
  /** Wait this long before showing the loader. Fast operations finish first and show nothing. */
  delay?: number;
  /** Once shown, keep the loader up at least this long so it never vanishes in a flash. */
  minDuration?: number;
}

/**
 * Gate a loading flag so brief operations never flash a loader.
 *
 * Without this, a chain of quick steps (create order -> load order -> save)
 * each flicker a full-screen overlay on for ~100ms then off, reading as stutter.
 * With it, sub-`delay` operations show no loader at all, and anything slow
 * enough to show stays up for a steady `minDuration`.
 */
export function useDelayedLoading(
  active: boolean,
  { delay = 250, minDuration = 400 }: UseDelayedLoadingOptions = {},
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (visible) return;
      const showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delay);
      return () => clearTimeout(showTimer);
    }

    // active === false: hold the already-visible loader for the remaining minDuration.
    if (!visible) return;
    const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : minDuration;
    const remaining = Math.max(0, minDuration - elapsed);
    const hideTimer = setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(hideTimer);
  }, [active, visible, delay, minDuration]);

  return visible;
}
