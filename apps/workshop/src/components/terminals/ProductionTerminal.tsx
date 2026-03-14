import { useState, useMemo } from "react";
import { useTerminalGarments } from "@/hooks/useWorkshopGarments";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useCompleteAndAdvance, useStartGarment } from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { STAGE_NEXT, PIECE_STAGE_LABELS } from "@/lib/constants";
import { Clock, AlertCircle, CheckCircle2, Play, ArrowRight } from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

interface ProductionTerminalProps {
  terminalStage: string;
  icon: React.ReactNode;
}

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

export function ProductionTerminal({ terminalStage, icon }: ProductionTerminalProps) {
  const { data: stageGarments = [], isLoading } = useTerminalGarments(terminalStage);
  const { data: allGarments = [] } = useWorkshopGarments();
  const completeMut = useCompleteAndAdvance();
  const startMut = useStartGarment();

  const [completeDialog, setCompleteDialog] = useState<WorkshopGarment | null>(null);
  const [worker, setWorker] = useState("");

  const stageLabel = PIECE_STAGE_LABELS[terminalStage as keyof typeof PIECE_STAGE_LABELS] ?? terminalStage;
  const nextStage = STAGE_NEXT[terminalStage];

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = today.toISOString().slice(0, 10);

  const historyKey = useMemo(() => {
    const map: Record<string, string> = {
      soaking: "soaker", cutting: "cutter", post_cutting: "post_cutter",
      sewing: "sewer", finishing: "finisher", ironing: "ironer",
      quality_check: "quality_checker",
    };
    return map[terminalStage] ?? terminalStage;
  }, [terminalStage]);

  const { queue, pending } = useMemo(() => {
    const q: WorkshopGarment[] = [];
    const p: WorkshopGarment[] = [];
    for (const g of stageGarments) {
      if (g.start_time) {
        q.push(g);
      } else if (g.assigned_date && g.assigned_date < todayStr) {
        p.push(g);
      } else {
        q.push(g);
      }
    }
    return { queue: q, pending: p };
  }, [stageGarments, todayStr]);

  const completedToday = useMemo(() => {
    if (!nextStage) return [];
    return allGarments.filter((g) => {
      if (g.location !== "workshop") return false;
      if (!g.completion_time) return false;
      const ct = new Date(g.completion_time);
      if (!isSameDay(ct, today)) return false;
      const wh = g.worker_history as Record<string, string> | null;
      return wh?.[historyKey] != null;
    }).filter((g) => {
      if (!nextStage) return false;
      return g.piece_stage === nextStage;
    });
  }, [allGarments, nextStage, today, historyKey]);

  const handleComplete = async () => {
    if (!completeDialog || !worker || !nextStage) return;
    await completeMut.mutateAsync({ id: completeDialog.id, worker, stage: terminalStage, nextStage });
    toast.success(`${completeDialog.garment_id ?? "Garment"} → ${PIECE_STAGE_LABELS[nextStage as keyof typeof PIECE_STAGE_LABELS] ?? nextStage}`);
    setCompleteDialog(null);
    setWorker("");
  };

  const renderGarmentList = (garments: WorkshopGarment[], showActions: boolean) => {
    if (garments.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-2xl bg-muted/10">
          <div className="opacity-30 mb-3">{icon}</div>
          <p className="font-semibold text-muted-foreground">No garments</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {garments.map((g, i) => (
          <GarmentCard
            key={g.id}
            garment={g}
            showPipeline
            compact
            index={i}
            actions={
              showActions ? (
                <div className="flex gap-2">
                  {!g.start_time && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startMut.mutate(g.id)}
                      disabled={startMut.isPending}
                      className="h-9 px-4 text-sm font-bold"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Start
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => { setCompleteDialog(g); setWorker(""); }}
                    className="h-9 px-4 text-sm font-bold bg-emerald-600 hover:bg-emerald-700"
                  >
                    Done
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              ) : undefined
            }
          />
        ))}
      </div>
    );
  };

  // Paginate completed list
  const completedPagination = usePagination(completedToday, 15);

  // Stats for the header
  const started = queue.filter((g) => g.start_time).length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          {icon} {stageLabel}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {stageGarments.length} garment{stageGarments.length !== 1 ? "s" : ""} at this station
        </p>
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
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
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

          <TabsContent value="queue">{renderGarmentList(queue, true)}</TabsContent>
          <TabsContent value="pending">{renderGarmentList(pending, true)}</TabsContent>
          <TabsContent value="completed">
            {renderGarmentList(completedPagination.paged, false)}
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

      <Dialog open={!!completeDialog} onOpenChange={(v) => !v && setCompleteDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Complete {stageLabel}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Garment</p>
              <p className="font-bold text-lg">{completeDialog?.garment_id}</p>
              {completeDialog?.customer_name && (
                <p className="text-sm text-muted-foreground">{completeDialog.customer_name}</p>
              )}
            </div>
            <WorkerDropdown responsibility={terminalStage} value={worker} onChange={setWorker} placeholder="Who completed this?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog(null)}>Cancel</Button>
            <Button
              onClick={handleComplete}
              disabled={!worker || completeMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Advance <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
