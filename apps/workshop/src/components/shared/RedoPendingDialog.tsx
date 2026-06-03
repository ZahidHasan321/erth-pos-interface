import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { Button } from "@repo/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@repo/ui/dialog";
import { EmptyState } from "@/components/shared/PageShell";
import { RedoDialog } from "@/components/shared/RedoDialog";
import type { RedoPendingRow } from "@/api/garments";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Reject-Redo discarded originals without a replacement yet. */
  pending: RedoPendingRow[];
};

/**
 * Dashboard launcher for the redo-pending queue (CLAUDE.md §2.5). Lists each
 * discarded original still needing a replacement; "Create" opens the RedoDialog
 * (root cause + priority capture) for that garment. Separate from the per-order
 * launch in the order detail page so the workshop can clear the queue from one
 * place.
 */
export function RedoPendingDialog({ open, onClose, pending }: Props) {
  const [activeGarmentId, setActiveGarmentId] = useState<string | null>(null);

  return (
    <>
      <Dialog open={open && !activeGarmentId} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="h-4 w-4 shrink-0 text-[var(--status-warn)]" aria-hidden="true" />
              Redo replacements pending
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            {pending.length === 0 ? (
              <EmptyState message="No redo replacements pending" />
            ) : (
              <ul className="space-y-2">
                {pending.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-sm text-foreground">
                        {row.garment_id ?? row.id.slice(0, 8)}
                      </span>
                      <Link
                        to="/assigned/$orderId"
                        params={{ orderId: String(row.order_id) }}
                        className="text-xs text-muted-foreground hover:text-foreground ml-2"
                        onClick={onClose}
                      >
                        Order #{row.order_id}
                      </Link>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => setActiveGarmentId(row.id)}>
                      Create
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <RedoDialog
        open={!!activeGarmentId}
        onClose={() => setActiveGarmentId(null)}
        garmentId={activeGarmentId}
      />
    </>
  );
}
