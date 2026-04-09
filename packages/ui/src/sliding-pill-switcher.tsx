import * as React from "react";
import { cn } from "./lib/utils";

export interface SlidingPillOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface SlidingPillSwitcherProps<T extends string> {
  value: T;
  options: ReadonlyArray<SlidingPillOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
  indicatorClassName?: string;
}

/**
 * Segmented pill switcher with a sliding active indicator. Used for
 * mutually-exclusive filters (date period, direction, etc.).
 */
export function SlidingPillSwitcher<T extends string>({
  value,
  options,
  onChange,
  className,
  size = "md",
  indicatorClassName,
}: SlidingPillSwitcherProps<T>) {
  const buttonsRef = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null);

  React.useLayoutEffect(() => {
    const measure = () => {
      const idx = options.findIndex((o) => o.value === value);
      const btn = buttonsRef.current[idx];
      if (btn) setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, options]);

  const sizeClasses =
    size === "sm"
      ? "text-[11px] px-3 py-1"
      : "text-xs px-4 py-1.5";

  return (
    <div
      className={cn(
        "relative inline-flex items-center border-2 rounded-lg p-0.5",
        className,
      )}
    >
      {indicator && (
        <div
          className={cn("absolute top-0.5 bottom-0.5 bg-primary rounded-md shadow-sm transition-all duration-300 ease-out", indicatorClassName)}
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          ref={(el) => {
            buttonsRef.current[i] = el;
          }}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 font-black uppercase tracking-wider rounded-md transition-colors duration-300 whitespace-nowrap",
            sizeClasses,
            value === o.value ? "text-white" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
