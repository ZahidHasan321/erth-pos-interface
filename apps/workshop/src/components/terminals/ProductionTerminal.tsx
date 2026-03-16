import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTerminalGarments, useCompletedTodayGarments } from "@/hooks/useWorkshopGarments";
import { GroupedGarmentList } from "@/components/shared/GroupedGarmentList";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { Clock, AlertCircle, CheckCircle2, CalendarDays } from "lucide-react";
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

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = today.toISOString().slice(0, 10);

  const { queue, pending } = useMemo(() => {
    const q: WorkshopGarment[] = [];
    const p: WorkshopGarment[] = [];
    for (const g of stageGarments) {
      const dateStr = g.assigned_date
        ? (typeof g.assigned_date === "string" ? g.assigned_date.slice(0, 10) : new Date(g.assigned_date).toISOString().slice(0, 10))
        : null;
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

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            {icon} {stageLabel}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stageGarments.length} garment{stageGarments.length !== 1 ? "s" : ""} at this station
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg">
          <CalendarDays className="w-4 h-4" />
          {new Date().toLocaleDateString("default", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-blue-700">{queue.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 opacity-70">Queue</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-emerald-700">{started}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 opacity-70">Started</p>
        </div>
        <div className={`rounded-xl p-2.5 text-center border ${pending.length > 0 ? "bg-red-50 border-red-200" : "bg-zinc-50 border-zinc-200"}`}>
          <p className={`text-xl font-black ${pending.length > 0 ? "text-red-700" : "text-zinc-400"}`}>{pending.length}</p>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${pending.length > 0 ? "text-red-600 opacity-70" : "text-zinc-400"}`}>Overdue</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-green-700">{completedToday.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 opacity-70">Done Today</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : (
        <Tabs defaultValue="queue">
          <TabsList className="mb-4">
            <TabsTrigger value="queue" className="gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Queue
              <Badge variant="secondary" className="ml-0.5 text-xs">{queue.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Overdue
              <Badge variant="secondary" className={`ml-0.5 text-xs ${pending.length > 0 ? "bg-red-100 text-red-700" : ""}`}>
                {pending.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
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
