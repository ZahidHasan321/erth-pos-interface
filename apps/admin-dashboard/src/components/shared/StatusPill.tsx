import { cn } from "@/lib/utils";

// ── Status / Location Pill ──────────────────────────────────
// The one pill primitive used across operations pages for status labels,
// location, trip indicators, feedback, and urgency signals.
//
// Design: rounded-md + optional dot/icon prefix. Every legacy hue name maps
// onto one of the four semantic --status-* buckets (ok / warn / bad / info)
// plus a neutral; color encodes meaning, never decoration. Never reach for a
// raw bg-{color}-100 / text-{color}-800 pair — add a hue alias here instead.
// Type scale (text-xs font-medium) matches StageBadge so weight reads
// consistent across a workshop page.

export type PillColor =
  | "green"
  | "emerald"
  | "sky"
  | "blue"
  | "violet"
  | "teal"
  | "purple"
  | "amber"
  | "orange"
  | "red"
  | "zinc";

// Map every legacy hue onto 4 semantic buckets driven by --status-* tokens.
// Color = meaning (ok/warn/bad/info/neutral), not decoration.
const PILL_STYLES: Record<PillColor, { bg: string; text: string; dot: string }> = {
  green:   { bg: "bg-[var(--status-ok-bg)]",   text: "text-[var(--status-ok)]",   dot: "bg-[var(--status-ok)]" },
  emerald: { bg: "bg-[var(--status-ok-bg)]",   text: "text-[var(--status-ok)]",   dot: "bg-[var(--status-ok)]" },
  teal:    { bg: "bg-[var(--status-ok-bg)]",   text: "text-[var(--status-ok)]",   dot: "bg-[var(--status-ok)]" },
  amber:   { bg: "bg-[var(--status-warn-bg)]", text: "text-[var(--status-warn)]", dot: "bg-[var(--status-warn)]" },
  orange:  { bg: "bg-[var(--status-warn-bg)]", text: "text-[var(--status-warn)]", dot: "bg-[var(--status-warn)]" },
  red:     { bg: "bg-[var(--status-bad-bg)]",  text: "text-[var(--status-bad)]",  dot: "bg-[var(--status-bad)]" },
  sky:     { bg: "bg-[var(--status-info-bg)]", text: "text-[var(--status-info)]", dot: "bg-[var(--status-info)]" },
  blue:    { bg: "bg-[var(--status-info-bg)]", text: "text-[var(--status-info)]", dot: "bg-[var(--status-info)]" },
  violet:  { bg: "bg-[var(--status-info-bg)]", text: "text-[var(--status-info)]", dot: "bg-[var(--status-info)]" },
  purple:  { bg: "bg-[var(--status-info-bg)]", text: "text-[var(--status-info)]", dot: "bg-[var(--status-info)]" },
  zinc:    { bg: "bg-muted",                   text: "text-muted-foreground",     dot: "bg-muted-foreground/40" },
};

interface StatusPillProps {
  color: PillColor;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}

export function StatusPill({ color, icon: Icon, children, className }: StatusPillProps) {
  const s = PILL_STYLES[color];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap",
        s.bg,
        s.text,
        className,
      )}
    >
      {Icon ? (
        <Icon className="w-3 h-3" />
      ) : (
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
      )}
      {children}
    </span>
  );
}
