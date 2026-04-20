import { cn } from "@/lib/utils";
import { Skeleton } from "@repo/ui/skeleton";
// Icon type that works with both lucide-react and @tabler/icons-react
type IconComponent = React.ComponentType<{ className?: string }>;

// ── Page Header ─────────────────────────────────────────────────────────────

interface PageHeaderProps {
  icon: IconComponent;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary shrink-0" aria-hidden="true" /> {title}
        </h1>
        {subtitle && (
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70 mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Stats Card ──────────────────────────────────────────────────────────────

interface StatsCardProps {
  icon: IconComponent;
  value: number;
  label: string;
  color: "blue" | "purple" | "orange" | "green" | "red" | "emerald" | "amber" | "zinc";
  /** If true, the card dims when value is 0 */
  dimOnZero?: boolean;
}

const STAT_COLORS = {
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-700",    label: "text-blue-600/80",    icon: "text-blue-600" },
  purple:  { bg: "bg-purple-50",  border: "border-purple-200",  text: "text-purple-700",  label: "text-purple-600/80",  icon: "text-purple-600" },
  orange:  { bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-700",  label: "text-orange-600/80",  icon: "text-orange-600" },
  green:   { bg: "bg-green-50",   border: "border-green-200",   text: "text-green-700",   label: "text-green-600/80",   icon: "text-green-600" },
  red:     { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     label: "text-red-600/80",     icon: "text-red-600" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", label: "text-emerald-600/80", icon: "text-emerald-600" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   label: "text-amber-600/80",   icon: "text-amber-600" },
  zinc:    { bg: "bg-zinc-50",    border: "border-zinc-200",    text: "text-zinc-500",    label: "text-zinc-400",       icon: "text-zinc-400" },
} as const;

export function StatsCard({ icon: Icon, value, label, color, dimOnZero }: StatsCardProps) {
  const isDimmed = dimOnZero && value === 0;
  const c = isDimmed ? STAT_COLORS.zinc : STAT_COLORS[color];

  return (
    <div className={cn("rounded-lg px-3 py-2 text-center border", c.bg, c.border)}>
      <Icon className={cn("w-3.5 h-3.5 mx-auto mb-0.5 opacity-60", c.icon)} aria-hidden="true" />
      <p className={cn("text-xl font-black tabular-nums leading-none", c.text)}>{value}</p>
      <p className={cn("text-[10px] font-bold uppercase tracking-wider mt-0.5", c.label)}>{label}</p>
    </div>
  );
}

// ── Empty State ─────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: IconComponent | React.ReactNode;
  message: string;
}

export function EmptyState({ icon: IconOrNode, message }: EmptyStateProps) {
  // Lucide icons are forwardRef objects with a `render` property, not plain functions
  const isComponent = IconOrNode && typeof IconOrNode === "object" && "render" in IconOrNode
    || typeof IconOrNode === "function";

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-xl bg-muted/5 animate-fade-in">
      {isComponent ? (
        (() => {
          const Icon = IconOrNode as IconComponent;
          return <Icon className="w-8 h-8 text-muted-foreground/20 mb-2" />;
        })()
      ) : IconOrNode ? (
        <div className="opacity-20 mb-2 scale-125">{IconOrNode}</div>
      ) : null}
      <p className="text-sm font-medium text-muted-foreground/50">{message}</p>
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

export function LoadingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 stagger-children">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl skeleton-shimmer" />
      ))}
    </div>
  );
}

// ── Metadata Chip ───────────────────────────────────────────────────────────

interface MetadataChipProps {
  icon?: IconComponent;
  children: React.ReactNode;
  variant?: "muted" | "amber" | "indigo";
  className?: string;
}

const CHIP_VARIANTS = {
  muted:  "text-muted-foreground bg-muted/60",
  amber:  "text-amber-700 bg-amber-100 font-semibold",
  indigo: "text-indigo-700 bg-indigo-100 font-bold uppercase tracking-wide border border-indigo-200",
} as const;

export function MetadataChip({ icon: Icon, children, variant = "muted", className }: MetadataChipProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md",
      CHIP_VARIANTS[variant],
      className,
    )}>
      {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

// ── Garment Type Badge ──────────────────────────────────────────────────────

export function GarmentTypeBadge({ type }: { type: string | null | undefined }) {
  return (
    <span
      className={cn(
        "text-xs font-black uppercase tracking-wide px-2 py-0.5 rounded-md border",
        type === "brova"
          ? "bg-purple-50 text-purple-800 border-purple-200"
          : "bg-blue-50 text-blue-800 border-blue-200",
      )}
    >
      {type}
    </span>
  );
}

export function GarmentTypeBadgeCompact({ type }: { type: string }) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-md text-xs font-black uppercase",
        type === "brova"
          ? "bg-purple-100 text-purple-800"
          : "bg-blue-100 text-blue-800",
      )}
    >
      {type === "brova" ? "B" : "F"}
    </span>
  );
}
