import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardCheck, X } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { getStocktakeStatus } from "@/api/stocktake";
import { cn } from "@/lib/utils";

const SIDE = "shop" as const;
const SNOOZE_KEY = `stocktake-snooze-${SIDE}`;
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // a week

function snoozedUntil(): number {
  try {
    const v = localStorage.getItem(SNOOZE_KEY);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

// Soft-block nag (CLAUDE.md §4): a dismissible banner when the monthly stocktake
// is overdue, escalating styling at tier 3 (>3 days), plus an entry modal at
// tier 3. Dismissing ("Later") snoozes the whole reminder for a week, so it
// doesn't reappear on every visit. Nothing is functionally locked.
export function StocktakeBanner({ main }: { main: string }) {
  const { data } = useQuery({ queryKey: ["stocktake_status", SIDE], queryFn: () => getStocktakeStatus(SIDE), staleTime: 60_000 });
  const [snoozed, setSnoozed] = useState(() => snoozedUntil() > Date.now());
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (data?.tier === 3 && snoozedUntil() <= Date.now()) setModalOpen(true);
  }, [data?.tier]);

  function snooze() {
    setModalOpen(false);
    setSnoozed(true);
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* ignore */ }
  }

  if (!data || data.tier === 0 || snoozed) return null;
  const tier3 = data.tier === 3;
  const days = data.days_overdue;

  return (
    <>
      <div
        role="status"
        className={cn("flex items-center justify-between gap-4 rounded-xl border px-4 py-3 mb-5", tier3 ? "border-red-300 bg-red-50" : "border-amber-200 bg-amber-50")}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle className={cn("h-4 w-4 shrink-0", tier3 ? "text-red-600" : "text-amber-600")} />
          <p className={cn("text-sm font-medium min-w-0", tier3 ? "text-red-900" : "text-amber-900")}>
            {tier3
              ? `Stocktake is ${days} day${days !== 1 ? "s" : ""} overdue. Please run a physical count.`
              : "The monthly stocktake is due."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" className={cn(tier3 ? "border-red-300 text-red-800 hover:bg-red-100" : "border-amber-200 text-amber-800 hover:bg-amber-100")} asChild>
            <Link to="/$main/store/stocktake" params={{ main }}>
              <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" /> Go to stocktake
            </Link>
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remind me later" title="Remind me in a week" onClick={snooze}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) snooze(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" /> Stocktake overdue
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The monthly physical count is {days} day{days !== 1 ? "s" : ""} overdue. Regular counts keep stock accurate. Please run one when you can.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={snooze}>Remind me in a week</Button>
            <Button asChild onClick={() => setModalOpen(false)}>
              <Link to="/$main/store/stocktake" params={{ main }}>Start stocktake</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
