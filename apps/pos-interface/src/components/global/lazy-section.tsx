import * as React from "react";

interface LazySectionProps {
  children: React.ReactNode;
  /** Fallback shown before the section enters the viewport */
  fallback?: React.ReactNode;
  /** IntersectionObserver rootMargin — how far ahead to start loading */
  rootMargin?: string;
  /** Force-mount the section regardless of intersection (e.g. when stepper is clicked) */
  forceMount?: boolean;
}

const defaultFallback = (
  <div className="w-full min-h-[200px]" />
);

export function LazySection({
  children,
  fallback = defaultFallback,
  rootMargin = "400px",
  forceMount = false,
}: LazySectionProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [hasIntersected, setHasIntersected] = React.useState(false);

  React.useEffect(() => {
    if (forceMount || hasIntersected) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasIntersected(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, forceMount, hasIntersected]);

  const shouldRender = forceMount || hasIntersected;

  return (
    <div ref={ref} className="w-full">
      {shouldRender ? children : fallback}
    </div>
  );
}
