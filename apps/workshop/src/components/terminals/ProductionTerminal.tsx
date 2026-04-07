import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTerminalGarments, useCompletedTodayGarments } from "@/hooks/useWorkshopGarments";
import { GroupedGarmentList } from "@/components/shared/GroupedGarmentList";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { PageHeader } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { Badge } from "@repo/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { Clock, AlertCircle, CheckCircle2, CalendarDays } from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

interface ProductionTerminalProps {
  terminalStage: string;
  icon: React.ComponentType<{ className?: string }>;
}

const HISTORY_KEY_MAP: Record<string, string> = {
  soaking: "soaker", cutting: "cutter", post_cutting: "post_cutter",
  sewing: "sewer", finishing: "finisher", ironing: "ironer",
  quality_check: "quality_checker",
};

export function ProductionTerminal({ terminalStage, icon: Icon }: ProductionTerminalProps) {
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

  const handleCardClick = (g: WorkshopGarment) => {
    navigate({ to: "/terminals/garment/$garmentId", params: { garmentId: g.id } });
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl md:max-w-5xl lg:max-w-6xl mx-auto">
      <PageHeader
        icon={Icon}
        title={stageLabel}
        subtitle={`${stageGarments.length} garment${stageGarments.length !== 1 ? "s" : ""} at this station`}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-card border px-2.5 py-1 rounded-md">
          <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
          {new Date().toLocaleDateString("default", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </div>
      </PageHeader>

      <Tabs defaultValue="queue">
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

        {isLoading ? (
          <div className="space-y-4">
            {/* Order group skeleton */}
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Array.from({ length: i === 0 ? 3 : 2 }, (_, j) => (
                    <div key={j} className="p-3 bg-card border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Skeleton className="h-5 w-6 rounded" />
                          <Skeleton className="h-3.5 w-16 rounded" />
                        </div>
                        <Skeleton className="h-4 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-24 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <TabsContent value="queue">
              <GroupedGarmentList garments={queue} onCardClick={handleCardClick} emptyIcon={<Icon className="w-10 h-10" />} />
            </TabsContent>
            <TabsContent value="pending">
              <GroupedGarmentList garments={pending} onCardClick={handleCardClick} emptyIcon={<Icon className="w-10 h-10" />} emptyText="No overdue garments" />
            </TabsContent>
            <TabsContent value="completed">
              <GroupedGarmentList garments={completedPagination.paged} emptyIcon={<Icon className="w-10 h-10" />} emptyText="No completions today" />
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
