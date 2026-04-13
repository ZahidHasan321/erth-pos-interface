import { useMemo, useState } from "react";
import { useTerminalGarments, useCompletedTodayGarments } from "@/hooks/useWorkshopGarments";
import { useStartGarment, useCancelStartGarment, useCompleteAndAdvance } from "@/hooks/useGarmentMutations";
import { PageHeader, GarmentTypeBadgeCompact } from "@/components/shared/PageShell";
import { ExpressBadge, BrandBadge } from "@/components/shared/StageBadge";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { Skeleton } from "@repo/ui/skeleton";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { cn, getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { getNextPlanStage } from "@/lib/constants";
import { Clock, AlertCircle, CheckCircle2, CalendarDays, Play, X, Check, Droplets, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { WorkshopGarment, ProductionPlan } from "@repo/database";

type SoakingFilter = "all" | "started";

const STAGE_ORDER: Record<string, number> = {
  soaking: 0, cutting: 1, post_cutting: 2, sewing: 3,
  finishing: 4, ironing: 5, quality_check: 6, ready_for_dispatch: 7,
};

export function SoakingTerminal() {
  const { data: stageGarments = [], isLoading } = useTerminalGarments("soaking");
  const { data: completedTodayAll = [] } = useCompletedTodayGarments();
  const [filter, setFilter] = useState<SoakingFilter>("all");
  const [activeTab, setActiveTab] = useState("queue");

  const todayStr = useMemo(() => getLocalDateStr(), []);

  const { queue, pending } = useMemo(() => {
    const q: WorkshopGarment[] = [];
    const p: WorkshopGarment[] = [];
    for (const g of stageGarments) {
      const dateStr = toLocalDateStr(g.assigned_date);
      if (dateStr && dateStr < todayStr) {
        p.push(g);
      } else {
        q.push(g);
      }
    }
    const sortFn = (a: WorkshopGarment, b: WorkshopGarment) =>
      (a.assigned_date ?? "\uffff").localeCompare(b.assigned_date ?? "\uffff") || a.id.localeCompare(b.id);
    q.sort(sortFn);
    p.sort(sortFn);
    return { queue: q, pending: p };
  }, [stageGarments, todayStr]);

  const startedCountQueue = useMemo(() => queue.filter((g) => g.start_time).length, [queue]);
  const startedCountPending = useMemo(() => pending.filter((g) => g.start_time).length, [pending]);
  const activeStartedCount = activeTab === "queue" ? startedCountQueue : activeTab === "pending" ? startedCountPending : 0;

  const filteredQueue = useMemo(
    () => filter === "started" ? queue.filter((g) => g.start_time) : queue,
    [queue, filter],
  );
  const filteredPending = useMemo(
    () => filter === "started" ? pending.filter((g) => g.start_time) : pending,
    [pending, filter],
  );

  const completedToday = useMemo(() => {
    return completedTodayAll.filter((g) => {
      const wh = g.worker_history as Record<string, string> | null;
      if (!wh?.soaking && !wh?.soaker) return false;
      const gStageOrder = STAGE_ORDER[g.piece_stage ?? ""] ?? 99;
      if (g.location === "workshop" && gStageOrder <= 0) return false;
      return true;
    });
  }, [completedTodayAll]);

  const completedPagination = usePagination(completedToday, 20);

  return (
    <div className="p-4 sm:p-6 max-w-4xl md:max-w-5xl lg:max-w-6xl mx-auto">
      <PageHeader
        icon={Droplets}
        title="Soaking"
        subtitle={`${stageGarments.length} garment${stageGarments.length !== 1 ? "s" : ""} at this station`}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-card border px-2.5 py-1 rounded-md">
          <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
          {new Date().toLocaleDateString("default", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="queue" className="gap-1.5">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            Queue
            <Badge variant="secondary" className="ml-0.5 text-xs bg-blue-100 text-blue-700">{queue.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
            Overdue
            <Badge variant="secondary" className={`ml-0.5 text-xs ${pending.length > 0 ? "bg-red-100 text-red-700" : ""}`}>
              {pending.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            Done
            <Badge variant="secondary" className="ml-0.5 text-xs bg-green-100 text-green-700">{completedToday.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-1.5 mb-3 border-t pt-3">
          {(["all", "started"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer",
                filter === f
                  ? f === "started"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
              )}
            >
              {f === "all" ? "All" : `Started${activeStartedCount > 0 ? ` (${activeStartedCount})` : ""}`}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <TabsContent value="queue">
              <SoakingGrid garments={filteredQueue} emptyText={filter === "started" ? "No started garments" : undefined} />
            </TabsContent>
            <TabsContent value="pending">
              <SoakingGrid garments={filteredPending} emptyText={filter === "started" ? "No started garments" : "No overdue garments"} />
            </TabsContent>
            <TabsContent value="completed">
              <SoakingGrid garments={completedPagination.paged} done emptyText="No completions today" />
              <Pagination
                page={completedPagination.page}
                totalPages={completedPagination.totalPages}
                onPageChange={completedPagination.setPage}
                totalItems={completedPagination.totalItems}
                pageSize={completedPagination.pageSize}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

// ── Grid ────────────────────────────────────────────────────────

function SoakingGrid({ garments, done, emptyText = "No garments" }: { garments: WorkshopGarment[]; done?: boolean; emptyText?: string }) {
  if (garments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-2xl bg-muted/20">
        <Droplets className="w-10 h-10 opacity-20 mb-3" />
        <p className="font-semibold text-muted-foreground/70">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {garments.map((g) =>
        done ? <SoakingCardDone key={g.id} garment={g} /> : <SoakingCard key={g.id} garment={g} />,
      )}
    </div>
  );
}

// ── Active card ─────────────────────────────────────────────────

function SoakingCard({ garment }: { garment: WorkshopGarment }) {
  const startMut = useStartGarment();
  const cancelMut = useCancelStartGarment();
  const completeMut = useCompleteAndAdvance();
  const [justStarted, setJustStarted] = useState(false);

  const plan = garment.production_plan as ProductionPlan | null;
  const nextStage = getNextPlanStage("soaking", plan as Record<string, string> | null);
  const isStarted = !!garment.start_time;

  const handleStart = () => {
    setJustStarted(true);
    startMut.mutate(garment.id, {
      onError: (err) => {
        setJustStarted(false);
        toast.error(`Failed to start: ${err?.message ?? "Unknown error"}`);
      },
    });
  };

  const handleDone = () => {
    if (!nextStage) return;
    completeMut.mutate(
      { id: garment.id, worker: "soaking", stage: "soaking", nextStage },
      { onError: (err: any) => toast.error(`Failed to complete: ${err?.message ?? "Unknown error"}`) },
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border p-3 transition-all duration-300",
        isStarted ? "bg-emerald-50 border-emerald-300 shadow-sm" : "bg-card border-border/60",
        isStarted && justStarted && "animate-soak-start",
        garment.express && "!border-orange-300",
      )}
      onAnimationEnd={() => setJustStarted(false)}
    >
      {/* Identity */}
      <div className="flex items-start justify-between gap-1 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <GarmentTypeBadgeCompact type={garment.garment_type ?? "final"} />
          <span className="font-mono font-black text-lg leading-tight">
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <BrandBadge brand={garment.order_brand} />
          {garment.express && <ExpressBadge />}
        </div>
      </div>

      {garment.invoice_number && (
        <span className="text-xs text-muted-foreground mb-2">#{garment.invoice_number}</span>
      )}

      {/* Actions */}
      <div className="mt-auto pt-1">
        {startMut.isPending ? (
          <Button size="sm" variant="outline" className="w-full h-9 font-bold" disabled>
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            Starting...
          </Button>
        ) : cancelMut.isPending ? (
          <Button size="sm" variant="outline" className="w-full h-9 font-bold text-muted-foreground" disabled>
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            Cancelling...
          </Button>
        ) : completeMut.isPending ? (
          <Button size="sm" className="w-full h-9 font-bold bg-emerald-600" disabled>
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            Completing...
          </Button>
        ) : !isStarted ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-9 font-bold"
            onClick={handleStart}
          >
            <Play className="w-4 h-4 mr-1" />
            Start
          </Button>
        ) : (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2.5 text-muted-foreground"
              onClick={() => cancelMut.mutate(garment.id)}
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              className="flex-1 h-9 font-bold bg-emerald-600 hover:bg-emerald-700"
              onClick={handleDone}
            >
              <Check className="w-4 h-4 mr-1" />
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Done card (read-only) ───────────────────────────────────────

function SoakingCardDone({ garment }: { garment: WorkshopGarment }) {
  return (
    <div className="flex flex-col rounded-lg border border-border/40 bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <GarmentTypeBadgeCompact type={garment.garment_type ?? "final"} />
          <span className="font-mono font-black text-lg leading-tight text-muted-foreground">
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </span>
        </div>
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
      </div>
      {garment.invoice_number && (
        <span className="text-xs text-muted-foreground mt-1">#{garment.invoice_number}</span>
      )}
    </div>
  );
}
