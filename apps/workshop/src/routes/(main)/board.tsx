import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Columns3, Loader2, Zap, Search } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/popover";
import { Calendar } from "@repo/ui/calendar";
import { Skeleton } from "@repo/ui/skeleton";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { PageHeader, EmptyState, GarmentTypeBadgeCompact, MetadataChip } from "@/components/shared/PageShell";
import { useBoardGarments } from "@/hooks/useWorkshopGarments";
import { BOARD_STAGES } from "@/api/garments";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { cn, getLocalDateStr, getDeliveryUrgency, formatDate, TIMEZONE } from "@/lib/utils";
import type { WorkshopGarment, ProductionPlan } from "@repo/database";

export const Route = createFileRoute("/(main)/board")({
  component: BoardPage,
  head: () => ({ meta: [{ title: "Production Board" }] }),
});

const STAGE_TO_PLAN_KEY: Record<string, keyof ProductionPlan> = {
  soaking: "soaker",
  cutting: "cutter",
  // post_cutting: "post_cutter", // TEMP DISABLED
  sewing: "sewer",
  finishing: "finisher",
  ironing: "ironer",
  quality_check: "quality_checker",
};

// Per-stage indicator dots — small, semantic. Column chrome stays neutral
// so the eye reads the data (cards), not the chrome. Ready-for-dispatch
// is the only stage that's a true "OK" terminal state.
const STAGE_DOT: Record<string, string> = {
  soaking: "bg-[var(--status-info)]",
  cutting: "bg-[var(--status-warn)]",
  // post_cutting: "bg-[var(--status-warn)]", // TEMP DISABLED
  sewing: "bg-[var(--status-info)]",
  finishing: "bg-[var(--status-info)]",
  ironing: "bg-[var(--status-info)]",
  quality_check: "bg-[var(--status-info)]",
  ready_for_dispatch: "bg-[var(--status-ok)]",
};

function parseLocalDate(dateStr: string): Date {
  // Noon Kuwait — unambiguous instant so Kuwait-tz formatters always land on the right date.
  return new Date(dateStr + "T12:00:00+03:00");
}

function dateToStr(d: Date): string {
  return getLocalDateStr(d);
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatBoardDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const today = getLocalDateStr();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const shortOpts = { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short" } as const;
  if (dateStr === today) return `Today · ${d.toLocaleDateString("en-GB", shortOpts)}`;
  if (dateStr === yesterday) return `Yesterday · ${d.toLocaleDateString("en-GB", shortOpts)}`;
  if (dateStr === tomorrow) return `Tomorrow · ${d.toLocaleDateString("en-GB", shortOpts)}`;
  return d.toLocaleDateString("en-GB", { ...shortOpts, year: "numeric" });
}

type BoardMode = "live" | "scheduled";

const MODE_OPTIONS = [
  { value: "live" as const, label: "Live" },
  { value: "scheduled" as const, label: "Scheduled" },
];

function BoardPage() {
  const today = useMemo(() => getLocalDateStr(), []);
  const [mode, setMode] = useState<BoardMode>("live");
  const [dateStr, setDateStr] = useState<string>(today);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const queryDate = mode === "live" ? null : dateStr;
  const { data: garments = [], isLoading, isFetching } = useBoardGarments(queryDate);

  const filteredGarments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return garments;
    const qDigits = q.replace(/\s+/g, "");
    return garments.filter(
      (g) =>
        (g.customer_name ?? "").toLowerCase().includes(q) ||
        String(g.order_id).includes(q) ||
        (g.invoice_number != null && String(g.invoice_number).includes(q)) ||
        (g.customer_mobile ?? "").replace(/\s+/g, "").includes(qDigits) ||
        (g.garment_id ?? "").toLowerCase().includes(q) ||
        (g.fabric_name ?? "").toLowerCase().includes(q) ||
        (g.style_name ?? "").toLowerCase().includes(q),
    );
  }, [garments, search]);

  const byStage = useMemo(() => {
    const m = new Map<string, WorkshopGarment[]>();
    for (const s of BOARD_STAGES) m.set(s, []);
    for (const g of filteredGarments) {
      if (!g.piece_stage) continue;
      const bucket = m.get(g.piece_stage);
      if (bucket) bucket.push(g);
    }
    return m;
  }, [filteredGarments]);

  const isToday = dateStr === today;
  const total = filteredGarments.length;

  const subtitle =
    mode === "live"
      ? `${total} garment${total !== 1 ? "s" : ""} currently in production`
      : `${total} garment${total !== 1 ? "s" : ""} scheduled for ${formatBoardDate(dateStr)}`;

  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <PageHeader icon={Columns3} title="Production Board" subtitle={subtitle}>
        <div className="flex items-center gap-2">
          {mode === "scheduled" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={isToday}
                onClick={() => setDateStr(today)}
              >
                Today
              </Button>
              <div className="flex items-center rounded-md border border-border bg-card">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-r-none"
                  onClick={() => setDateStr(addDays(dateStr, -1))}
                  aria-label="Previous day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1.5 h-8 px-3 border-x border-border text-sm font-medium tabular-nums whitespace-nowrap hover:bg-muted/50 w-[200px]"
                    >
                      <CalendarIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                      {formatBoardDate(dateStr)}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="center" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={parseLocalDate(dateStr)}
                      onSelect={(d) => {
                        if (d) {
                          setDateStr(dateToStr(d));
                          setPickerOpen(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-l-none"
                  onClick={() => setDateStr(addDays(dateStr, 1))}
                  aria-label="Next day"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
          <div className="w-4 h-4 flex items-center justify-center shrink-0" aria-hidden={!(isFetching && !isLoading)}>
            {isFetching && !isLoading && (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" aria-label="Updating" />
            )}
          </div>
          <SlidingPillSwitcher
            value={mode}
            options={MODE_OPTIONS}
            onChange={setMode}
            size="sm"
          />
        </div>
      </PageHeader>

      <div className="relative max-w-sm mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Garment, customer, order, fabric, style…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
        {BOARD_STAGES.map((stage) => (
          <BoardColumn
            key={stage}
            stage={stage}
            garments={byStage.get(stage) ?? []}
            isLoading={isLoading}
          />
        ))}
      </div>
    </div>
  );
}

interface ColumnProps {
  stage: string;
  garments: WorkshopGarment[];
  isLoading: boolean;
}

function BoardColumn({ stage, garments, isLoading }: ColumnProps) {
  const label = PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ?? stage;
  const dot = STAGE_DOT[stage] ?? "bg-muted-foreground";

  return (
    <div className="w-[260px] shrink-0 snap-start flex flex-col rounded-md border border-border bg-card max-h-[calc(100vh-230px)]">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} aria-hidden="true" />
          <span className="text-sm font-medium text-foreground truncate">{label}</span>
        </div>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">
          {garments.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-16 rounded-md" />
            <Skeleton className="h-16 rounded-md" />
          </>
        ) : garments.length === 0 ? (
          <div className="py-6">
            <EmptyState message="None" />
          </div>
        ) : (
          garments.map((g) => <GarmentBoardCard key={g.id} g={g} stage={stage} />)
        )}
      </div>
    </div>
  );
}

function GarmentBoardCard({ g, stage }: { g: WorkshopGarment; stage: string }) {
  const planKey = STAGE_TO_PLAN_KEY[stage];
  const worker = planKey ? g.production_plan?.[planKey] : undefined;
  const trip = g.trip_number ?? 1;
  const altNum = trip >= 2 ? trip - 1 : null;
  const started = !!g.start_time;

  const invoice = g.invoice_number ? `#${g.invoice_number}` : `#${g.order_id}`;
  const deliveryRaw = g.delivery_date
    ? (g.delivery_date instanceof Date ? g.delivery_date.toISOString() : g.delivery_date)
    : g.delivery_date_order ?? null;
  const urgency = getDeliveryUrgency(deliveryRaw);

  return (
    <div
      className={cn(
        "rounded-md border bg-background px-2.5 py-2 transition-colors",
        // Express = exceptional state, encoded by left-stripe in semantic bad token.
        g.express && "border-l-2 border-l-[var(--status-bad)]",
        // Started = exceptional state, encoded by green border. No ring (rule: shadows/rings for popovers only).
        started ? "border-[var(--status-ok)]" : "border-border hover:border-primary/40",
      )}
    >
      <div className="flex items-start gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-base font-medium">{invoice}</span>
          {g.garment_id && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums truncate">{g.garment_id}</span>
          )}
          {g.express && (
            <Zap className="w-3.5 h-3.5 text-red-700 shrink-0" aria-label="Express" />
          )}
        </div>
        {deliveryRaw && (
          <div className={cn("ml-auto flex flex-col items-end leading-tight tabular-nums", urgency.text)}>
            <span className="text-xs font-medium whitespace-nowrap">{formatDate(deliveryRaw)}</span>
            {urgency.label && urgency.status !== "normal" && (
              <span className="text-xs font-medium">{urgency.label}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <GarmentTypeBadgeCompact type={g.garment_type ?? "final"} />
        {altNum != null && <MetadataChip variant="amber">Alt {altNum}</MetadataChip>}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="text-sm truncate flex-1 min-w-0">
          {worker ? (
            <span className="text-foreground">{worker}</span>
          ) : (
            <span className="text-muted-foreground italic">Unassigned</span>
          )}
        </div>
        {started && (
          <span className="relative flex w-2 h-2 shrink-0" aria-label="In progress">
            <span className="absolute inset-0 rounded-full bg-[var(--status-ok)] animate-ping opacity-75" />
            <span className="relative rounded-full w-2 h-2 bg-[var(--status-ok)]" />
          </span>
        )}
      </div>
    </div>
  );
}
