import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, History } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";

import { cn, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import { formatQty } from "@/lib/inventory";
import { getFabrics } from "@/api/fabrics";
import { getShelf } from "@/api/shelf";
import { getAccessories } from "@/api/accessories";
import { getStocktakeSession, getStocktakeCounts } from "@/api/stocktake";
import type { StockItemType } from "@repo/database";

export const Route = createFileRoute("/$main/store/stocktake_/history_/$sessionId")({
  component: StocktakeHistoryDetailPage,
  head: () => ({ meta: [{ title: "Stocktake detail | Inventory" }] }),
});

function StocktakeHistoryDetailPage() {
  const { main, sessionId } = Route.useParams();
  const id = Number(sessionId);
  const validId = Number.isFinite(id);

  const sessionQ = useQuery({ queryKey: ["stocktake_session", id], queryFn: () => getStocktakeSession(id), enabled: validId, staleTime: 60_000 });
  const countsQ = useQuery({ queryKey: ["stocktake_counts", id], queryFn: () => getStocktakeCounts(id), enabled: validId, staleTime: 60_000 });
  const fabricsQ = useQuery({ queryKey: ["fabrics", { archived: true }], queryFn: () => getFabrics(true), staleTime: 60_000 });
  const shelfQ = useQuery({ queryKey: ["shelf", { archived: true }], queryFn: () => getShelf(true), staleTime: 60_000 });
  const accQ = useQuery({ queryKey: ["accessories", { archived: true }], queryFn: () => getAccessories(true), staleTime: 60_000 });

  const nameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fabricsQ.data ?? []) m.set(`fabric:${f.id}`, f.name);
    for (const s of shelfQ.data ?? []) m.set(`shelf:${s.id}`, s.type ?? `Shelf #${s.id}`);
    for (const a of accQ.data ?? []) m.set(`accessory:${a.id}`, a.name);
    return m;
  }, [fabricsQ.data, shelfQ.data, accQ.data]);

  const rows = useMemo(
    () =>
      (countsQ.data ?? [])
        .map((c) => ({
          key: `${c.item_type}:${c.item_id}`,
          itemType: c.item_type as StockItemType,
          name: nameByKey.get(`${c.item_type}:${c.item_id}`) ?? `${c.item_type} #${c.item_id}`,
          system: c.system_qty ?? 0,
          counted: c.counted_qty ?? 0,
          variance: c.variance ?? 0,
          reason: c.reason,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [countsQ.data, nameByKey],
  );

  const varianceCount = rows.filter((r) => r.variance !== 0).length;
  const loading = sessionQ.isLoading || countsQ.isLoading;

  return (
    <div className="p-4 sm:p-6 max-w-[1000px] mx-auto pb-12 space-y-6">
      <div className="flex items-start gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/$main/store/stocktake/history" params={{ main }}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> History
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            {sessionQ.data?.validated_at
              ? parseUtcTimestamp(sessionQ.data.validated_at).toLocaleDateString(undefined, { timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric" })
              : "Stocktake"}
          </h1>
          {sessionQ.data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {rows.length} item{rows.length !== 1 ? "s" : ""} counted · {varianceCount} variance{varianceCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !sessionQ.data ? (
        <p className="text-sm text-muted-foreground">Stocktake not found.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No counts were recorded in this stocktake.</p>
      ) : (
        <div className="overflow-auto rounded-xl border bg-card">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right w-[110px]">System</TableHead>
                <TableHead className="text-right w-[110px]">Counted</TableHead>
                <TableHead className="text-right w-[110px]">Variance</TableHead>
                <TableHead className="w-[280px]">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    <span className="text-sm font-medium">{r.name}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">{r.itemType}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{formatQty(r.itemType, r.system)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatQty(r.itemType, r.counted)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums text-sm font-medium",
                      r.variance === 0 ? "text-muted-foreground" : r.variance > 0 ? "text-green-700" : "text-red-700",
                    )}
                  >
                    {r.variance === 0 ? "-" : `${r.variance > 0 ? "+" : ""}${formatQty(r.itemType, r.variance)}`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reason?.trim() || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </div>
  );
}
