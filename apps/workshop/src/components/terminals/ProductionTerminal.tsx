import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTerminalGarments } from "@/hooks/useWorkshopGarments";
import { useAuth } from "@/context/auth";
import { isTerminalUser } from "@/lib/rbac";
import {
  PageHeader,
  EmptyState,
  LoadingSkeleton,
  GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "@repo/ui/table";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { PIECE_STAGE_LABELS, getNextPlanStage } from "@/lib/constants";
import { cn, clickableProps, TIMEZONE } from "@/lib/utils";
import { toast } from "sonner";
import {
  useStartGarment,
  useCancelStartGarment,
  useCompleteAndAdvance,
} from "@/hooks/useGarmentMutations";
import type {
  WorkshopGarment,
  TripHistoryEntry,
  StageTimings,
  ProductionPlan,
} from "@repo/database";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Zap,
  Package,
  Wrench,
  PlayCircle,
  Search,
  Droplets,
  Timer,
  Clock,
  Play,
  Check,
  X,
  Loader2,
  History,
} from "lucide-react";

interface ProductionTerminalProps {
  terminalStage: string;
  icon: React.ComponentType<{ className?: string }>;
  /** "full" = working/express/brova/final/alterations (default).
   *  "simple" = working + assigned only (soaking). */
  variant?: "full" | "simple";
}

// ── helpers ──────────────────────────────────────────────────────────────────

// Map the user's job_function to the matching key inside production_plan.
// Keys in ProductionPlan are verb/trade nouns (except "quality_checker"), while
// job_function uses person nouns — mostly identical. Only "qc" needs remapping.
const JOB_FUNCTION_TO_PLAN_KEY: Record<string, keyof ProductionPlan> = {
  soaker: "soaker",
  cutter: "cutter",
  post_cutter: "post_cutter",
  sewer: "sewer",
  finisher: "finisher",
  ironer: "ironer",
  qc: "quality_checker",
};

function hasQcFailThisTrip(g: WorkshopGarment): boolean {
  const trip = g.trip_number ?? 1;
  const hist = g.trip_history as TripHistoryEntry[] | null;
  const entry = hist?.find((t) => t.trip === trip);
  return !!entry?.qc_attempts?.some((a) => a.result === "fail");
}

/** Alt label for a returning garment. Priority: QC-fail (alt_p) > trip-based (alt_N). */
function getAltLabel(g: WorkshopGarment): string | null {
  if (hasQcFailThisTrip(g)) return "alt_p";
  const trip = g.trip_number ?? 1;
  if (trip >= 2) return `alt_${trip - 1}`;
  return null;
}

function isAlterationRow(g: WorkshopGarment): boolean {
  return (g.trip_number ?? 1) >= 2 || hasQcFailThisTrip(g);
}

/** "Currently working" = user has clicked Start at this terminal.
 * in_production alone isn't enough — that flag means "scheduled for production,
 * moving through pipeline", set broadly on receive-and-start. start_time is
 * cleared on every stage advance, so it's scoped to this stage only. */
function isWorking(g: WorkshopGarment): boolean {
  return !!g.start_time;
}

/** Returns the ISO start time of the current open session at the given stage,
 * falling back to the top-level start_time column if stage_timings is empty. */
function getCurrentSessionStart(
  g: WorkshopGarment,
  stage: string,
): string | null {
  const timings = (g.stage_timings as StageTimings | null | undefined) ?? null;
  const list = timings?.[stage];
  const tail = list?.[list.length - 1];
  if (tail && tail.completed_at === null) return tail.started_at;
  return g.start_time ? String(g.start_time) : null;
}

type SectionKey =
  | "working"
  | "express"
  | "brova"
  | "final"
  | "alterations"
  | "assigned";

/** Exclusive assignment: each garment lands in one section. Currently working wins. */
function classify(g: WorkshopGarment, variant: "full" | "simple"): SectionKey {
  if (isWorking(g)) return "working";
  if (variant === "simple") return "assigned";
  if (isAlterationRow(g)) return "alterations";
  if (g.express) return "express";
  return g.garment_type === "brova" ? "brova" : "final";
}

// ── elapsed timer ────────────────────────────────────────────────────────────

function ElapsedTimer({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const ms = Date.now() - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  const display =
    hrs > 0 ? `${hrs}h ${remainMins}m` : mins > 0 ? `${mins}m` : "just now";
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-mono font-bold text-emerald-700 tabular-nums">
      <Timer className="w-3 h-3" />
      {display}
    </span>
  );
}

// ── alt badge ────────────────────────────────────────────────────────────────

function AltBadge({ label }: { label: string }) {
  const isQc = label === "alt_p";
  return (
    <Badge
      className={cn(
        "font-semibold text-xs uppercase tracking-wide border-0 text-white",
        isQc ? "bg-red-600" : "bg-orange-500",
      )}
    >
      {label}
    </Badge>
  );
}

// ── inline actions (soaking terminal) ────────────────────────────────────────

function InlineActions({
  garment,
  stage,
}: {
  garment: WorkshopGarment;
  stage: string;
}) {
  const startMut = useStartGarment();
  const cancelMut = useCancelStartGarment();
  const completeMut = useCompleteAndAdvance();

  const plan = garment.production_plan as ProductionPlan | null;
  const nextStage = getNextPlanStage(
    stage,
    plan as Record<string, string> | null,
  );
  const plannedWorker = (plan as any)?.soaker ?? "";
  const working = isWorking(garment);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const onStart = (e: React.MouseEvent) => {
    stop(e);
    startMut.mutate(garment.id, {
      onError: (err) =>
        toast.error(`Failed to start: ${err?.message ?? "Unknown error"}`),
    });
  };

  const onCancel = (e: React.MouseEvent) => {
    stop(e);
    cancelMut.mutate(garment.id, {
      onError: (err) =>
        toast.error(`Failed to cancel: ${err?.message ?? "Unknown error"}`),
    });
  };

  const onDone = (e: React.MouseEvent) => {
    stop(e);
    if (!nextStage) {
      toast.error("No next stage in production plan");
      return;
    }
    if (!plannedWorker) {
      toast.error("No soaker assigned to this garment");
      return;
    }
    completeMut.mutate(
      { id: garment.id, worker: plannedWorker, stage, nextStage },
      {
        onError: (err) =>
          toast.error(`Failed to advance: ${err?.message ?? "Unknown error"}`),
      },
    );
  };

  if (!working) {
    return (
      <Button
        size="sm"
        className="h-8 bg-blue-600 hover:bg-blue-700"
        onClick={onStart}
        disabled={startMut.isPending}
      >
        {startMut.isPending ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : (
          <Play className="w-3.5 h-3.5 mr-1" />
        )}
        Start
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        className="h-8 bg-emerald-600 hover:bg-emerald-700"
        onClick={onDone}
        disabled={completeMut.isPending}
      >
        {completeMut.isPending ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : (
          <Check className="w-3.5 h-3.5 mr-1" />
        )}
        Done
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={onCancel}
        disabled={cancelMut.isPending}
      >
        {cancelMut.isPending ? (
          <Loader2 className="w-3.5 h-3.5" />
        ) : (
          <X className="w-3.5 h-3.5" />
        )}
      </Button>
    </div>
  );
}

// ── row ──────────────────────────────────────────────────────────────────────

function GarmentRow({
  garment,
  stage,
  onClick,
  showAlt,
  showExpressFlag,
  showActions,
}: {
  garment: WorkshopGarment;
  stage: string;
  onClick?: () => void;
  showAlt?: boolean;
  showExpressFlag?: boolean;
  showActions?: boolean;
}) {
  const altLabel = showAlt ? getAltLabel(garment) : null;
  const working = isWorking(garment);
  const sessionStart = working ? getCurrentSessionStart(garment, stage) : null;

  return (
    <TableRow
      {...(onClick ? { ...clickableProps(onClick), onClick } : {})}
      className={cn(
        onClick && "cursor-pointer hover:bg-muted/40",
        working && "bg-emerald-50/40",
      )}
    >
      <TableCell className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-sm font-bold">
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {showExpressFlag && garment.express && <ExpressBadge />}
            {garment.soaking && (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full">
                <Droplets className="w-3 h-3" /> Soak
              </span>
            )}
            {sessionStart && <ElapsedTimer since={sessionStart} />}
          </div>
        </div>
      </TableCell>
      <TableCell className="px-3 py-3">
        <GarmentTypeBadge type={garment.garment_type ?? "final"} />
      </TableCell>
      {showAlt && (
        <TableCell className="px-3 py-3">
          {altLabel && <AltBadge label={altLabel} />}
        </TableCell>
      )}
      <TableCell className="px-3 py-3 font-mono">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">#{garment.order_id}</span>
          {garment.invoice_number && (
            <span className="text-xs text-muted-foreground">
              INV-{garment.invoice_number}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{garment.customer_name ?? "—"}</span>
          {garment.customer_mobile && (
            <span className="text-xs font-mono text-muted-foreground">
              {garment.customer_mobile}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3 text-sm">
        {garment.fabric_name ? (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-medium truncate">{garment.fabric_name}</span>
            {garment.fabric_color && (
              <span className="text-xs text-muted-foreground truncate">
                {garment.fabric_color}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Outside</span>
        )}
      </TableCell>
      <TableCell className="px-3 py-3 text-sm">
        <span className="truncate block max-w-[160px]">
          {garment.style_name ?? garment.style ?? "—"}
        </span>
      </TableCell>
      <TableCell className="px-3 py-3">
        <BrandBadge brand={garment.order_brand} />
      </TableCell>
      {showActions && (
        <TableCell className="px-3 py-3 text-right">
          <InlineActions garment={garment} stage={stage} />
        </TableCell>
      )}
    </TableRow>
  );
}

// ── section table ────────────────────────────────────────────────────────────

function SectionTable({
  garments,
  stage,
  onRowClick,
  showAlt,
  showExpressFlag,
  showActions,
}: {
  garments: WorkshopGarment[];
  stage: string;
  onRowClick?: (g: WorkshopGarment) => void;
  showAlt?: boolean;
  showExpressFlag?: boolean;
  showActions?: boolean;
}) {
  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
            <TableHead className="w-[120px]">Garment</TableHead>
            <TableHead className="w-[80px]">Type</TableHead>
            {showAlt && <TableHead className="w-[80px]">Alt</TableHead>}
            <TableHead className="w-[110px]">Order / Invoice</TableHead>
            <TableHead className="w-[170px]">Customer</TableHead>
            <TableHead className="w-[160px]">Fabric</TableHead>
            <TableHead className="w-[160px]">Style</TableHead>
            <TableHead className="w-[80px]">Brand</TableHead>
            {showActions && (
              <TableHead className="w-[180px] text-right">Actions</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => (
            <GarmentRow
              key={g.id}
              garment={g}
              stage={stage}
              onClick={onRowClick ? () => onRowClick(g) : undefined}
              showAlt={showAlt}
              showExpressFlag={showExpressFlag}
              showActions={showActions}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ── section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  count,
  accent,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-base text-foreground">{title}</h2>
        <Badge variant="secondary" className={cn("text-xs", accent)}>
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}

// ── sort helper ──────────────────────────────────────────────────────────────

/** Group by order, sort groups by delivery date, within each group keep brovas
 * before finals. Matches the receiving/operations page layout. */
function groupByOrderSorted(garments: WorkshopGarment[]): WorkshopGarment[] {
  const groups = new Map<number, WorkshopGarment[]>();
  for (const g of garments) {
    if (!groups.has(g.order_id)) groups.set(g.order_id, []);
    groups.get(g.order_id)!.push(g);
  }
  return [...groups.values()]
    .sort((a, b) => {
      const da = a[0]?.delivery_date_order ?? "";
      const db = b[0]?.delivery_date_order ?? "";
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return 0;
    })
    .map((group) =>
      group.sort((a, b) => {
        if (a.garment_type === "brova" && b.garment_type !== "brova") return -1;
        if (a.garment_type !== "brova" && b.garment_type === "brova") return 1;
        return (a.garment_id ?? "").localeCompare(b.garment_id ?? "");
      }),
    )
    .flat();
}

// ── main ─────────────────────────────────────────────────────────────────────

export function ProductionTerminal({
  terminalStage,
  icon: Icon,
  variant = "full",
}: ProductionTerminalProps) {
  const { data: stageGarments = [], isLoading } =
    useTerminalGarments(terminalStage);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  // Terminal-locked users see only the garments the scheduler assigned to
  // them in production_plan. Office users (admin/manager/staff without
  // job_function) still see every garment at this stage, which is how the
  // sidebar view has always worked.
  const scopedGarments = useMemo(() => {
    if (!isTerminalUser(user) || !user?.job_function || !user?.name) {
      return stageGarments;
    }
    const planKey = JOB_FUNCTION_TO_PLAN_KEY[user.job_function];
    if (!planKey) return stageGarments;
    return stageGarments.filter((g) => {
      const plan = g.production_plan as ProductionPlan | null;
      return plan?.[planKey] === user.name;
    });
  }, [stageGarments, user]);

  const stageLabel =
    PIECE_STAGE_LABELS[terminalStage as keyof typeof PIECE_STAGE_LABELS] ??
    terminalStage;

  const searchFilter = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return (g: WorkshopGarment) =>
      (g.customer_name ?? "").toLowerCase().includes(q) ||
      String(g.order_id).includes(q) ||
      (g.invoice_number != null && String(g.invoice_number).includes(q)) ||
      (g.customer_mobile ?? "")
        .replace(/\s+/g, "")
        .includes(q.replace(/\s+/g, "")) ||
      (g.garment_id ?? "").toLowerCase().includes(q) ||
      (g.fabric_name ?? "").toLowerCase().includes(q) ||
      (g.style_name ?? "").toLowerCase().includes(q);
  }, [search]);

  const sections = useMemo(() => {
    const base: Record<SectionKey, WorkshopGarment[]> = {
      working: [],
      express: [],
      brova: [],
      final: [],
      alterations: [],
      assigned: [],
    };
    for (const g of scopedGarments) {
      if (searchFilter && !searchFilter(g)) continue;
      base[classify(g, variant)].push(g);
    }
    for (const k of Object.keys(base) as SectionKey[]) {
      base[k] = groupByOrderSorted(base[k]);
    }
    return base;
  }, [scopedGarments, searchFilter, variant]);

  const handleClick = (g: WorkshopGarment) => {
    navigate({
      to: "/terminals/garment/$garmentId",
      params: { garmentId: g.id },
    });
  };

  const total = scopedGarments.length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10 space-y-8">
      <PageHeader
        icon={Icon}
        title={stageLabel}
        subtitle={`${total} garment${total !== 1 ? "s" : ""} at this station`}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/terminals/$stage/history",
                params: { stage: terminalStage },
              })
            }
          >
            <History className="w-3.5 h-3.5 mr-1" />
            History
          </Button>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-card border px-2.5 py-1 rounded-md">
            <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
            {new Date().toLocaleDateString("default", {
              timeZone: TIMEZONE,
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Garment, customer, order, fabric, style…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* ── Currently Working ── */}
          <Section
            title="Currently Working"
            icon={PlayCircle}
            count={sections.working.length}
            accent="bg-emerald-100 text-emerald-700"
          >
            {sections.working.length === 0 ? (
              <EmptyState
                icon={PlayCircle}
                message="Nothing in production right now"
              />
            ) : (
              <SectionTable
                garments={sections.working}
                stage={terminalStage}
                onRowClick={variant === "simple" ? undefined : handleClick}
                showAlt
                showExpressFlag
                showActions={variant === "simple"}
              />
            )}
          </Section>

          {variant === "simple" ? (
            /* ── Assigned ── */
            <Section
              title="Assigned"
              icon={Clock}
              count={sections.assigned.length}
              accent="bg-blue-100 text-blue-700"
            >
              {sections.assigned.length === 0 ? (
                <EmptyState icon={Clock} message="No garments assigned" />
              ) : (
                <SectionTable
                  garments={sections.assigned}
                  stage={terminalStage}
                  showExpressFlag
                  showActions
                />
              )}
            </Section>
          ) : (
            <>
              {/* ── Express ── */}
              <Section
                title="Express"
                icon={Zap}
                count={sections.express.length}
                accent="bg-orange-100 text-orange-700"
              >
                {sections.express.length === 0 ? (
                  <EmptyState
                    icon={Zap}
                    message="No express garments waiting"
                  />
                ) : (
                  <SectionTable
                    garments={sections.express}
                    stage={terminalStage}
                    onRowClick={handleClick}
                  />
                )}
              </Section>

              {/* ── Brova ── */}
              <Section
                title="Brova"
                icon={Package}
                count={sections.brova.length}
                accent="bg-amber-100 text-amber-700"
              >
                {sections.brova.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    message="No brova garments waiting"
                  />
                ) : (
                  <SectionTable
                    garments={sections.brova}
                    stage={terminalStage}
                    onRowClick={handleClick}
                  />
                )}
              </Section>

              {/* ── Final ── */}
              <Section
                title="Final"
                icon={Package}
                count={sections.final.length}
                accent="bg-emerald-100 text-emerald-700"
              >
                {sections.final.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    message="No final garments waiting"
                  />
                ) : (
                  <SectionTable
                    garments={sections.final}
                    stage={terminalStage}
                    onRowClick={handleClick}
                  />
                )}
              </Section>

              {/* ── Alterations ── */}
              <Section
                title="Alterations"
                icon={Wrench}
                count={sections.alterations.length}
                accent="bg-purple-100 text-purple-700"
              >
                {sections.alterations.length === 0 ? (
                  <EmptyState icon={Wrench} message="No alterations waiting" />
                ) : (
                  <SectionTable
                    garments={sections.alterations}
                    stage={terminalStage}
                    onRowClick={handleClick}
                    showAlt
                    showExpressFlag
                  />
                )}
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
