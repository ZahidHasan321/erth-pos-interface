import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@repo/ui/button";
import { SectionCard } from "@/components/shared/PageShell";
import { RedoDialog } from "@/components/shared/RedoDialog";
import { useAuth } from "@/context/auth";
import { isAdmin, isManager } from "@/lib/rbac";
import type { RedoPendingRow } from "@/api/garments";

/**
 * Decisions-hub section: Reject-Redo discarded originals still needing a
 * replacement (CLAUDE.md §2.5). Each row's "Create" opens the RedoDialog
 * (root cause + priority capture). The in-context "Create replacement" buttons
 * on the order/garment detail pages remain; this is the consolidated queue.
 */
export function RedoPendingSection({ rows }: { rows: RedoPendingRow[] }) {
  const { user } = useAuth();
  const canResolve = isManager(user) || isAdmin(user);
  const [activeGarmentId, setActiveGarmentId] = useState<string | null>(null);

  return (
    <SectionCard title={`Redo — create replacement (${rows.length})`}>
      <div className="divide-y divide-border -mx-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 px-2 py-3">
            <div className="min-w-0 flex-1">
              <span className="font-mono text-base text-foreground">
                {row.garment_id ?? row.id.slice(0, 8)}
              </span>
              <Link
                to="/assigned/$orderId"
                params={{ orderId: String(row.order_id) }}
                className="text-xs text-muted-foreground hover:text-foreground ml-2"
              >
                Order #{row.order_id}
              </Link>
            </div>
            {canResolve ? (
              <Button size="sm" variant="destructive" onClick={() => setActiveGarmentId(row.id)}>
                Create
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground w-16 text-right">discarded</span>
            )}
          </div>
        ))}
      </div>

      {canResolve && (
        <RedoDialog
          open={!!activeGarmentId}
          onClose={() => setActiveGarmentId(null)}
          garmentId={activeGarmentId}
        />
      )}
    </SectionCard>
  );
}
