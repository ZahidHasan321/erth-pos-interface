import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, History } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";

import { getStocktakeHistory } from "@/api/stocktake";
import { PageHeader, EmptyState } from "@/components/shared/PageShell";

export const Route = createFileRoute("/(main)/store/stocktake_/history")({
  component: StocktakeHistoryPage,
  head: () => ({ meta: [{ title: "Stocktake history" }] }),
});

const SIDE = "workshop" as const;

function StocktakeHistoryPage() {
  const historyQ = useQuery({
    queryKey: ["stocktake_history", SIDE, "all"],
    queryFn: () => getStocktakeHistory(SIDE, 100),
    staleTime: 60_000,
  });

  return (
    <div className="px-4 sm:px-6 py-5 max-w-[800px] mx-auto pb-12 space-y-5">
      <div className="mb-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/store/stocktake">
            <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" /> Stocktake
          </Link>
        </Button>
      </div>

      <PageHeader
        icon={History}
        title="Stocktake history"
        subtitle="Every validated count of the workshop's stock. Open one to see the counted items and variance reasons."
      />

      {historyQ.isLoading ? (
        <Skeleton className="h-40 rounded-md" />
      ) : historyQ.data && historyQ.data.length > 0 ? (
        <ul className="rounded-md border border-border divide-y divide-border">
          {historyQ.data.map((h) => (
            <li key={h.id}>
              <Link
                to="/store/stocktake/history/$sessionId"
                params={{ sessionId: String(h.id) }}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors motion-reduce:transition-none"
              >
                <span className="font-medium">
                  {h.validated_at
                    ? new Date(h.validated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
                    : "-"}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Validated <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={History} message="No validated stocktakes yet." />
      )}
    </div>
  );
}
