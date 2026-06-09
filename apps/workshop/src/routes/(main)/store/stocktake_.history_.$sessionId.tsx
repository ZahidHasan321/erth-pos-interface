import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, History } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";

import { cn } from "@/lib/utils";
import { formatQty } from "@/lib/inventory";
import { getFabrics } from "@/api/fabrics";
import { getAccessories } from "@/api/accessories";
import { getStocktakeSession, getStocktakeCounts } from "@/api/stocktake";
import { PageHeader, EmptyState } from "@/components/shared/PageShell";
import type { StockItemType } from "@repo/database";

export const Route = createFileRoute("/(main)/store/stocktake_/history_/$sessionId")({
  component: StocktakeHistoryDetailPage,
  head: () => ({ meta: [{ title: "Stocktake detail" }] }),
});

function StocktakeHistoryDetailPage() {
  const { sessionId } = Route.useParams();
  const id = Number(sessionId);
  const validId = Number.isFinite(id);

  const sessionQ = useQuery({ queryKey: ["stocktake_session", id], queryFn: () => getStocktakeSession(id), enabled: validId, staleTime: 60_000 });
  const countsQ = useQuery({ queryKey: ["stocktake_counts", id], queryFn: () => getStocktakeCounts(id), enabled: validId, staleTime: 60_000 });
  const fabricsQ = useQuery({ queryKey: ["fabrics", { archived: true }], queryFn: () => getFabrics(true), staleTime: 60_000 });
  const accQ = useQuery({ queryKey: ["accessories", { archived: true }], queryFn: () => getAccessories(true), staleTime: 60_000 });

  const nameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fabricsQ.data ?? []) m.set(`fabric:${f.id}`, f.name);
    for (const a of accQ.data ?? []) m.set(`accessory:${a.id}`, a.name);
    return m;
  }, [fabricsQ.data, accQ.data]);

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
    <div className="px-4 sm:px-6 py-5 max-w-[1000px] mx-auto pb-12 space-y-5">
      <div className="mb-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/store/stocktake/history">
            <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" /> History
          </Link>
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-md" />
      ) : !sessionQ.data ? (
        <EmptyState icon={History} message="Stocktake not found." />
      ) : (
        <>
          <PageHeader
            icon={History}
            title={
              sessionQ.data.validated_at
                ? new Date(sessionQ.data.validated_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
                : "Stocktake"
            }
            subtitle={`${rows.length} item${rows.length !== 1 ? "s" : ""} counted · ${varianceCount} variance${varianceCount !== 1 ? "s" : ""}`}
          />

          {rows.length === 0 ? (
            <EmptyState icon={History} message="No counts were recorded in this stocktake." />
          ) : (
            <TableContainer className="rounded-md shadow-none">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
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
                        <span className="text-sm">{r.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground capitalize">{r.itemType}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{formatQty(r.itemType, r.system)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatQty(r.itemType, r.counted)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums text-sm font-medium",
                          r.variance === 0 ? "text-muted-foreground" : r.variance > 0 ? "text-[var(--status-ok)]" : "text-[var(--status-bad)]",
                        )}
                      >
                        {r.variance === 0 ? "-" : `${r.variance > 0 ? "+" : ""}${formatQty(r.itemType, r.variance)}`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.reason?.trim() || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </div>
  );
}
