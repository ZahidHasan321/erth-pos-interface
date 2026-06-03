import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardCheck, X } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { StatusBanner } from "@/components/shared/PageShell";
import { getStocktakeStatus } from "@/api/stocktake";

const SIDE = "workshop" as const;

// Soft-block nag (CLAUDE.md §4): a persistent, dismissible banner when the
// monthly stocktake is overdue, escalating at tier 3 (>3 days), plus a
// once-per-session entry modal at tier 3. Nothing is functionally locked.
export function StocktakeBanner() {
  const { data } = useQuery({ queryKey: ["stocktake_status", SIDE], queryFn: () => getStocktakeStatus(SIDE), staleTime: 60_000 });
  const [hidden, setHidden] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (data?.tier === 3) {
      try {
        if (sessionStorage.getItem(`stocktake-nag-${SIDE}`) !== "1") setModalOpen(true);
      } catch {
        setModalOpen(true);
      }
    }
  }, [data?.tier]);

  function dismissModal() {
    setModalOpen(false);
    try { sessionStorage.setItem(`stocktake-nag-${SIDE}`, "1"); } catch { /* ignore */ }
  }

  if (!data || data.tier === 0) return null;
  const tier3 = data.tier === 3;
  const days = data.days_overdue;

  return (
    <>
      {!hidden && (
        <StatusBanner tone={tier3 ? "bad" : "warn"} icon={AlertTriangle} className="mb-4 items-center">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 font-medium">
              {tier3
                ? `Stocktake is ${days} day${days !== 1 ? "s" : ""} overdue — please run a physical count.`
                : "The monthly stocktake is due."}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" asChild>
                <Link to="/store/stocktake">
                  <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Go to stocktake
                </Link>
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Dismiss reminder" onClick={() => setHidden(true)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </StatusBanner>
      )}

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) dismissModal(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[var(--status-bad)]" aria-hidden="true" /> Stocktake overdue
            </DialogTitle>
            <DialogDescription>
              The monthly physical count is {days} day{days !== 1 ? "s" : ""} overdue. Regular counts keep stock accurate — please run one when you can.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={dismissModal}>Later</Button>
            <Button asChild onClick={dismissModal}>
              <Link to="/store/stocktake">Start stocktake</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
