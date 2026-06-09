import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, History } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";

import { getStocktakeHistory } from "@/api/stocktake";

export const Route = createFileRoute("/$main/store/stocktake_/history")({
  component: StocktakeHistoryPage,
  head: () => ({ meta: [{ title: "Stocktake history | Inventory" }] }),
});

const SIDE = "shop" as const;

function StocktakeHistoryPage() {
  const { main } = Route.useParams();
  const historyQ = useQuery({
    queryKey: ["stocktake_history", SIDE, "all"],
    queryFn: () => getStocktakeHistory(SIDE, 100),
    staleTime: 60_000,
  });

  return (
    <div className="p-4 sm:p-6 max-w-[800px] mx-auto pb-12 space-y-6">
      <div className="flex items-start gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/$main/store/stocktake" params={{ main }}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Stocktake
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" /> Stocktake history
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every validated count of the shop's stock. Open one to see the counted items and variance reasons.
          </p>
        </div>
      </div>

      {historyQ.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : historyQ.data && historyQ.data.length > 0 ? (
        <ul className="rounded-xl border divide-y">
          {historyQ.data.map((h) => (
            <li key={h.id}>
              <Link
                to="/$main/store/stocktake/history/$sessionId"
                params={{ main, sessionId: String(h.id) }}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors motion-reduce:transition-none"
              >
                <span className="font-medium">
                  {h.validated_at
                    ? new Date(h.validated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
                    : "-"}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Validated <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No validated stocktakes yet.</p>
      )}
    </div>
  );
}
