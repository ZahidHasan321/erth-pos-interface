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
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2.5">
          <Icon className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Section Card ────────────────────────────────────────────────────────────
// Bordered card with an optional muted header. Use this instead of writing
// `bg-card border border-border rounded-md` by hand.

interface SectionCardProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({ title, action, children, className, bodyClassName }: SectionCardProps) {
  return (
    <section className={cn("bg-card border border-border rounded-md overflow-hidden", className)}>
      {(title || action) && (
        <header className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>}
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

// ── Section Label ───────────────────────────────────────────────────────────
// Small label for inline section headings inside lists/forms. Replaces the
// `uppercase tracking-wider font-bold` pattern.

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-sm font-medium text-muted-foreground", className)}>
      {children}
    </span>
  );
}

// ── Status Banner ───────────────────────────────────────────────────────────
// Inline alert bar with semantic tone. Replaces raw `bg-red-50 text-red-800`
// patterns. Use sparingly — `tone` should match real state, not decoration.

type StatusTone = "ok" | "warn" | "bad" | "info";

interface StatusBannerProps {
  tone: StatusTone;
  icon?: IconComponent;
  children: React.ReactNode;
  className?: string;
}

const BANNER_TONE: Record<StatusTone, string> = {
  ok:   "bg-[var(--status-ok-bg)]   text-[var(--status-ok)]   border-[color:var(--status-ok)]/30",
  warn: "bg-[var(--status-warn-bg)] text-[var(--status-warn)] border-[color:var(--status-warn)]/30",
  bad:  "bg-[var(--status-bad-bg)]  text-[var(--status-bad)]  border-[color:var(--status-bad)]/30",
  info: "bg-[var(--status-info-bg)] text-[var(--status-info)] border-[color:var(--status-info)]/30",
};

export function StatusBanner({ tone, icon: Icon, children, className }: StatusBannerProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-sm",
        BANNER_TONE[tone],
        className,
      )}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────
// Headline metric tile for the analytics pages. The value is the one signal —
// icon + label stay muted, and `tone` colors the number green/amber/red so a
// manager reads status without parsing the figure. Shared by Performance and
// QC Analytics (single source of truth).

const KPI_TONE: Record<"ok" | "warn" | "bad", string> = {
  ok:   "text-[var(--status-ok)]",
  warn: "text-[var(--status-warn)]",
  bad:  "text-[var(--status-bad)]",
};

interface KpiCardProps {
  icon: IconComponent;
  label: string;
  value: string | number;
  subtitle?: string;
  /** Color the value by status. Omit/null leaves it neutral foreground. */
  tone?: "ok" | "warn" | "bad" | null;
}

export function KpiCard({ icon: Icon, label, value, subtitle, tone }: KpiCardProps) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <p className="text-xs">{label}</p>
      </div>
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight mt-2", tone ? KPI_TONE[tone] : "")}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>}
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

// Neutral card surface; semantic accent only on icon + value. Background tints
// previously made every metric scream — flat cards let the number do the talking.
const STAT_ACCENT = {
  blue:    "text-[var(--status-info)]",
  purple:  "text-[var(--status-info)]",
  orange:  "text-[var(--status-warn)]",
  green:   "text-[var(--status-ok)]",
  red:     "text-[var(--status-bad)]",
  emerald: "text-[var(--status-ok)]",
  amber:   "text-[var(--status-warn)]",
  zinc:    "text-muted-foreground",
} as const;

export function StatsCard({ icon: Icon, value, label, color, dimOnZero }: StatsCardProps) {
  const isDimmed = dimOnZero && value === 0;
  const accent = isDimmed ? STAT_ACCENT.zinc : STAT_ACCENT[color];

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4 shrink-0", isDimmed ? "text-muted-foreground/50" : accent)} aria-hidden="true" />
        <p className={cn("text-xs text-muted-foreground", isDimmed && "text-muted-foreground/60")}>{label}</p>
      </div>
      <p className={cn("text-xl font-semibold tabular-nums leading-tight mt-1", isDimmed ? "text-muted-foreground/60" : "text-foreground")}>{value}</p>
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
    <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border rounded-md bg-card animate-fade-in">
      {isComponent ? (
        (() => {
          const Icon = IconOrNode as IconComponent;
          return <Icon className="w-6 h-6 text-muted-foreground/40 mb-2" />;
        })()
      ) : IconOrNode ? (
        <div className="opacity-40 mb-2">{IconOrNode}</div>
      ) : null}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

export function LoadingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2 stagger-children">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-16 rounded-md skeleton-shimmer" />
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
  muted:  "text-muted-foreground bg-muted",
  amber:  "text-[var(--status-warn)] bg-[var(--status-warn-bg)]",
  indigo: "text-[var(--status-info)] bg-[var(--status-info-bg)]",
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
        "text-xs font-medium capitalize px-2 py-0.5 rounded-md border",
        type === "brova"
          ? "bg-[var(--status-info-bg)] text-[var(--status-info)] border-transparent"
          : type === "alteration"
            ? "bg-[var(--status-warn-bg)] text-[var(--status-warn)] border-transparent"
            : "bg-muted text-foreground border-border",
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
        "px-1.5 py-0.5 rounded-sm text-xs font-semibold tabular-nums",
        type === "brova"
          ? "bg-[var(--status-info-bg)] text-[var(--status-info)]"
          : type === "alteration"
            ? "bg-[var(--status-warn-bg)] text-[var(--status-warn)]"
            : "bg-muted text-foreground",
      )}
    >
      {type === "brova" ? "B" : type === "alteration" ? "A" : "F"}
    </span>
  );
}
