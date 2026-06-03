import * as React from "react";
import { cn } from "@/lib/utils";

// ── FilterChip / FilterChipGroup ──────────────────────────────────────────
// The one toggle-chip primitive for the workshop app, promoted from the
// assigned-page chip (active state + optional count badge + optional icon).
// Replaces three near-identical local copies (assigned `FilterChip`,
// parking `FilterChips`, performance `StageFilter`).
//
// Token-based active state (foreground/background fill), touch-sized on coarse
// pointers, single rounded-md.

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  /** Tint for the icon when inactive (e.g. a stage-color dot/icon). */
  iconColor?: string;
  count?: number;
  children: React.ReactNode;
  className?: string;
}

export function FilterChip({
  active,
  onClick,
  icon: Icon,
  iconColor,
  count,
  children,
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 pointer-coarse:h-11 pointer-coarse:px-4 rounded-md border text-sm font-medium transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-card text-foreground border-border hover:bg-muted/50",
        className,
      )}
    >
      {Icon && <Icon className={cn("w-3.5 h-3.5", !active && iconColor)} />}
      <span>{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            "tabular-nums text-xs",
            active ? "text-background/70" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function FilterChipGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {children}
    </div>
  );
}
