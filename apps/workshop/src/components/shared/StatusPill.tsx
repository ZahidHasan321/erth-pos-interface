import { cn } from "@/lib/utils";

// ── Status / Location Pill ──────────────────────────────────
// The one pill primitive used across operations pages for status labels,
// location, trip indicators, feedback, and urgency signals.
//
// Design: rounded-full + optional dot/icon prefix + bg-{color}-100 / text-{color}-800.
// Type scale matches StageBadge (text-xs uppercase tracking-wide font-semibold)
// so it reads as consistent weight with everything else on a workshop page.

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

const PILL_STYLES: Record<PillColor, { bg: string; text: string; dot: string }> = {
  green:   { bg: "bg-green-100",   text: "text-green-800",   dot: "bg-green-500" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-800", dot: "bg-emerald-500" },
  sky:     { bg: "bg-sky-100",     text: "text-sky-800",     dot: "bg-sky-500" },
  blue:    { bg: "bg-blue-100",    text: "text-blue-800",    dot: "bg-blue-500" },
  violet:  { bg: "bg-violet-100",  text: "text-violet-800",  dot: "bg-violet-500" },
  teal:    { bg: "bg-teal-100",    text: "text-teal-800",    dot: "bg-teal-500" },
  purple:  { bg: "bg-purple-100",  text: "text-purple-800",  dot: "bg-purple-500" },
  amber:   { bg: "bg-amber-100",   text: "text-amber-800",   dot: "bg-amber-500" },
  orange:  { bg: "bg-orange-100",  text: "text-orange-800",  dot: "bg-orange-500" },
  red:     { bg: "bg-red-100",     text: "text-red-800",     dot: "bg-red-500" },
  zinc:    { bg: "bg-zinc-100",    text: "text-zinc-700",    dot: "bg-zinc-400" },
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
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide whitespace-nowrap",
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
