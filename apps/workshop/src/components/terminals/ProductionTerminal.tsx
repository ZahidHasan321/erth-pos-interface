import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTerminalGarments, useCompletedTodayGarments } from "@/hooks/useWorkshopGarments";
import { GroupedGarmentList } from "@/components/shared/GroupedGarmentList";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { StatsCard, LoadingSkeleton } from "@/components/shared/PageShell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { Clock, AlertCircle, CheckCircle2, CalendarDays, Gauge } from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

interface ProductionTerminalProps {
  terminalStage: string;
  icon: React.ReactNode;
}

const HISTORY_KEY_MAP: Record<string, string> = {
  soaking: "soaker", cutting: "cutter", post_cutting: "post_cutter",
  sewing: "sewer", finishing: "finisher", ironing: "ironer",
  quality_check: "quality_checker",
};

export function ProductionTerminal({ terminalStage, icon }: ProductionTerminalProps) {
  const { data: stageGarments = [], isLoading } = useTerminalGarments(terminalStage);
  const { data: completedTodayAll = [] } = useCompletedTodayGarments();
  const navigate = useNavigate();

  const stageLabel = PIECE_STAGE_LABELS[terminalStage as keyof typeof PIECE_STAGE_LABELS] ?? terminalStage;
  const historyKey = HISTORY_KEY_MAP[terminalStage] ?? terminalStage;

  // Stage order for "done" detection — garment is past this stage if its order > ours
  const STAGE_ORDER: Record<string, number> = {
    soaking: 0, cutting: 1, post_cutting: 2, sewing: 3,
    finishing: 4, ironing: 5, quality_check: 6, ready_for_dispatch: 7,
  };
  const thisStageOrder = STAGE_ORDER[terminalStage] ?? 0;

  const todayStr = useMemo(() => getLocalDateStr(), []);

  const { queue, pending } = useMemo(() => {
    const q: WorkshopGarment[] = [];
    const p: WorkshopGarment[] = [];
    for (const g of stageGarments) {
      const dateStr = toLocalDateStr(g.assigned_date);
      if (g.start_time) {
        // Already started — always show in queue
        q.push(g);
      } else if (dateStr && dateStr < todayStr) {
        // Past due
        p.push(g);
      } else {
        // Today, future, or no date — show in queue
        q.push(g);
      }
    }
    // Sort: started first, then express, then by assigned date
    const sortFn = (a: WorkshopGarment, b: WorkshopGarment) => {
      if (a.start_time && !b.start_time) return -1;
      if (!a.start_time && b.start_time) return 1;
      if (a.express && !b.express) return -1;
      if (!a.express && b.express) return 1;
      const dateA = a.assigned_date ?? "";
      const dateB = b.assigned_date ?? "";
      return dateA.localeCompare(dateB);
    };
    q.sort(sortFn);
    p.sort(sortFn);
    return { queue: q, pending: p };
  }, [stageGarments, todayStr]);

  // "Done" = garments completed today that passed through this station
  const completedToday = useMemo(() => {
    return completedTodayAll.filter((g) => {
      const wh = g.worker_history as Record<string, string> | null;
      if (!wh?.[terminalStage] && !wh?.[historyKey]) return false;
      // Must be beyond this stage
      const gStageOrder = STAGE_ORDER[g.piece_stage ?? ""] ?? 99;
      if (g.location === "workshop" && gStageOrder <= thisStageOrder) return false;
      return true;
    });
  }, [completedTodayAll, terminalStage, historyKey, thisStageOrder]);

  const completedPagination = usePagination(completedToday, 15);
  const started = queue.filter((g) => g.start_time).length;

  const handleCardClick = (g: WorkshopGarment) => {
    navigate({ to: "/terminals/garment/$garmentId", params: { garmentId: g.id } });
  };

  // Use Gauge as the header icon since we receive ReactNode but PageHeader needs LucideIcon
  // We'll render the icon inline instead
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-end justify-between animate-fade-in">
        <div>
          <h1 className="text-xl tracking-tight flex items-center gap-2">
            {icon} <span className="font-normal">Production</span> <span className="font-bold text-primary">{stageLabel}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stageGarments.length} garment{stageGarments.length !== 1 ? "s" : ""} at this station
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-card border px-2.5 py-1 rounded-md">
          <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
          {new Date().toLocaleDateString("default", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 stagger-children">
        <StatsCard icon={Clock} value={queue.length} label="Queue" color="blue" />
        <StatsCard icon={Gauge} value={started} label="Started" color="emerald" />
        <StatsCard icon={AlertCircle} value={pending.length} label="Overdue" color="red" dimOnZero />
        <StatsCard icon={CheckCircle2} value={completedToday.length} label="Done Today" color="green" />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <Tabs defaultValue="queue">
          <TabsList className="mb-3 flex-nowrap overflow-x-auto">
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

          <TabsContent value="queue">
            <GroupedGarmentList garments={queue} onCardClick={handleCardClick} emptyIcon={icon} />
          </TabsContent>
          <TabsContent value="pending">
            <GroupedGarmentList garments={pending} onCardClick={handleCardClick} emptyIcon={icon} emptyText="No overdue garments" />
          </TabsContent>
          <TabsContent value="completed">
            <GroupedGarmentList garments={completedPagination.paged} emptyIcon={icon} emptyText="No completions today" />
            <Pagination
              page={completedPagination.page}
              totalPages={completedPagination.totalPages}
              onPageChange={completedPagination.setPage}
              totalItems={completedPagination.totalItems}
              pageSize={completedPagination.pageSize}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
