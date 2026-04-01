import * as React from "react";
import { cn } from "./lib/utils";

interface ChipToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Color scheme when active. Defaults to "primary". */
  activeVariant?: "primary" | "blue" | "destructive";
}

/**
 * Small pill/toggle button used for filters, payment methods, discount types,
 * delivery mode, etc. Provides consistent sizing, touch feedback, and
 * active/inactive visual states across the app.
 */
const ChipToggle = React.forwardRef<HTMLButtonElement, ChipToggleProps>(
  ({ className, active, activeVariant = "primary", children, ...props }, ref) => {
    const activeClasses: Record<string, string> = {
      primary: "border-primary bg-primary text-primary-foreground font-semibold shadow-sm",
      blue: "bg-blue-100 text-blue-700 shadow-sm border-blue-200",
      destructive: "border-destructive bg-destructive text-white font-semibold shadow-sm",
    };

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          // Base
          "inline-flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150",
          // Touch
          "cursor-pointer select-none touch-manipulation active:scale-[0.96] active:brightness-[0.97]",
          // States
          active
            ? activeClasses[activeVariant]
            : "border-border bg-background hover:bg-accent/50 hover:border-primary/40",
          // Disabled
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
ChipToggle.displayName = "ChipToggle";

export { ChipToggle };
